import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const maxDuration = 300;

type SubtitleEntry = { start: number; end: number; text: string };
type ElevenLabsWord = { text: string; start: number; end: number; type: string };

function splitIntoSentences(script: string): string[] {
  return script
    .split(/(?<=[.!?])\s+|(?<=[.!?])$/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Map script sentences to real word timestamps from ElevenLabs STT */
function mapScriptToWordTimestamps(
  script: string,
  words: ElevenLabsWord[]
): SubtitleEntry[] {
  // Only use actual spoken words (skip spacing/audio_event tokens)
  const spokenWords = words.filter((w) => w.type === "word" && w.start != null);
  if (!spokenWords.length) return [];

  const sentences = splitIntoSentences(script);
  if (!sentences.length) return [];

  const totalChars = script.replace(/\s+/g, "").length;
  let charAccum = 0;

  return sentences.map((sentence) => {
    const sentenceChars = sentence.replace(/\s+/g, "").length;
    const startRatio = charAccum / totalChars;
    charAccum += sentenceChars;
    const endRatio = Math.min(charAccum / totalChars, 1);

    // Map character ratios → word index range
    const startIdx = Math.floor(startRatio * spokenWords.length);
    const endIdx = Math.min(
      Math.ceil(endRatio * spokenWords.length) - 1,
      spokenWords.length - 1
    );

    const startWord = spokenWords[Math.max(startIdx, 0)];
    const endWord = spokenWords[Math.max(endIdx, 0)];

    return {
      start: Math.round(startWord.start * 1000) / 1000,
      end: Math.round(endWord.end * 1000) / 1000,
      text: sentence,
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, videoUrl, script, style, fontSize, fontName, introOffset = 0, language = "ko" } =
      await req.json();

    if (!audioUrl || !videoUrl) {
      return NextResponse.json(
        { error: "오디오와 비디오 URL이 필요합니다" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

    // Download audio
    const audioRes = await fetch(audioUrl);
    const audioBuffer = await audioRes.arrayBuffer();

    // Call ElevenLabs STT (scribe_v1) — returns word-level timestamps
    const formData = new FormData();
    formData.append("audio", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
    formData.append("model_id", "scribe_v1");
    if (language === "en") formData.append("language_code", "en");
    else formData.append("language_code", "ko");

    const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
    });

    if (!sttRes.ok) {
      const err = await sttRes.text();
      throw new Error(`ElevenLabs STT error: ${sttRes.status} ${err}`);
    }

    const sttData = await sttRes.json() as { text: string; words: ElevenLabsWord[] };
    const words = sttData.words ?? [];

    if (!words.length) {
      return NextResponse.json(
        { error: "음성 타이밍을 분석할 수 없습니다. 오디오를 확인해주세요." },
        { status: 422 }
      );
    }

    const subtitles: SubtitleEntry[] = script
      ? mapScriptToWordTimestamps(script, words)
      : words
          .filter((w) => w.type === "word")
          .map((w) => ({ start: w.start, end: w.end, text: w.text }));

    // Offset timestamps when intro was prepended to the video
    const finalSubtitles = introOffset > 0
      ? subtitles.map((s) => ({ ...s, start: s.start + introOffset, end: s.end + introOffset }))
      : subtitles;

    const subtitledVideoUrl = await burnSubtitles(videoUrl, finalSubtitles, {
      style: style ?? "white",
      fontSize: fontSize ?? 24,
      fontName: fontName ?? "",
    });

    return NextResponse.json({ subtitles: finalSubtitles, subtitledVideoUrl });
  } catch (error) {
    console.error("Subtitle generation error:", error);
    return NextResponse.json(
      { error: "자막 생성 중 오류가 발생했습니다", detail: String(error) },
      { status: 500 }
    );
  }
}

function escapeDrawtext(t: string): string {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

async function burnSubtitles(
  videoUrl: string,
  subtitles: SubtitleEntry[],
  options: { style: string; fontSize: number; fontName: string }
): Promise<string> {
  const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
  const FFMPEG = `"${ffmpegInstaller.path}"`;

  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const tempVideo = path.join(tmpDir, `input-${ts}.mp4`).replace(/\\/g, "/");
  const outputVideo = path.join(tmpDir, `subtitled-${ts}.mp4`).replace(/\\/g, "/");

  try {
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`비디오 다운로드 실패: ${videoRes.status}`);
    await fs.writeFile(tempVideo, Buffer.from(await videoRes.arrayBuffer()));

    const { style, fontSize } = options;

    const fontAbsPath = path.join(process.cwd(), "public", "fonts", "NanumGothic.ttf");
    let fontFilePart = "";
    try {
      await fs.access(fontAbsPath);
      fontFilePart = `:fontfile='${fontAbsPath.replace(/\\/g, "/")}'`;
    } catch {
      console.warn("[subtitles] Font not found, using system default");
    }

    const fontcolor = style === "yellow" ? "yellow" : "white";

    const filters = subtitles.map((sub) => {
      const safeText = escapeDrawtext(sub.text);
      const ts0 = sub.start.toFixed(3);
      const ts1 = sub.end.toFixed(3);

      let f =
        `drawtext=text='${safeText}'` +
        `:enable='between(t,${ts0},${ts1})'` +
        fontFilePart +
        `:fontsize=${fontSize}` +
        `:fontcolor=${fontcolor}` +
        `:x=(w-tw)/2` +
        `:y=h-th-50`;

      if (style === "outline") {
        f += `:shadowcolor=black@0.8:shadowx=2:shadowy=2`;
      } else {
        f += `:box=1:boxcolor=black@0.5:boxborderw=8`;
      }
      return f;
    });

    const vf = filters.join(",");
    const cmd =
      `${FFMPEG} -i "${tempVideo}" -vf "${vf}" ` +
      `-c:v libx264 -c:a copy -pix_fmt yuv420p -movflags +faststart "${outputVideo}" -y`;

    console.log("[subtitles] ElevenLabs STT, subtitle count =", subtitles.length);
    const { stderr } = await execAsync(cmd, {
      timeout: 180000,
      maxBuffer: 50 * 1024 * 1024,
    });
    if (stderr) console.log("[subtitles] FFmpeg stderr (tail):", stderr.slice(-800));

    const supabase = createServiceClient();
    const outputBuffer = await fs.readFile(outputVideo);
    const fileName = `videos/subtitled-${ts}.mp4`;

    const { error } = await supabase.storage
      .from("media")
      .upload(fileName, outputBuffer, { contentType: "video/mp4" });
    if (error) throw error;

    const { data } = supabase.storage.from("media").getPublicUrl(fileName);
    return data.publicUrl;
  } finally {
    await Promise.all([
      fs.unlink(tempVideo).catch(() => {}),
      fs.unlink(outputVideo).catch(() => {}),
    ]);
  }
}
