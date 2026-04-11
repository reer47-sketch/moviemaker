import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 300;

type SubtitleEntry = { start: number; end: number; text: string };

function mapScriptToSegments(
  script: string,
  whisperSegs: { start: number; end: number }[]
): SubtitleEntry[] {
  if (!whisperSegs.length) return [];

  const words = script.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const totalDuration =
    whisperSegs[whisperSegs.length - 1].end - whisperSegs[0].start;

  const result: SubtitleEntry[] = [];
  let wordIdx = 0;

  for (let i = 0; i < whisperSegs.length; i++) {
    const seg = whisperSegs[i];
    const segDuration = seg.end - seg.start;
    const isLast = i === whisperSegs.length - 1;

    const wordsForSeg = isLast
      ? words.length - wordIdx
      : Math.max(1, Math.round(words.length * (segDuration / totalDuration)));

    const chunk = words.slice(wordIdx, wordIdx + wordsForSeg).join(" ");
    wordIdx += wordsForSeg;

    if (chunk) result.push({ start: seg.start, end: seg.end, text: chunk });
  }

  if (wordIdx < words.length && result.length > 0) {
    result[result.length - 1].text += " " + words.slice(wordIdx).join(" ");
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, videoUrl, script, style, fontSize, fontName } =
      await req.json();

    if (!audioUrl || !videoUrl) {
      return NextResponse.json(
        { error: "오디오와 비디오 URL이 필요합니다" },
        { status: 400 }
      );
    }

    const audioRes = await fetch(audioUrl);
    const audioBuffer = await audioRes.arrayBuffer();
    const audioFile = new File([audioBuffer], "audio.mp3", { type: "audio/mpeg" });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "ko",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    const whisperSegs = (transcription.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
    }));

    if (!whisperSegs.length) {
      return NextResponse.json(
        { error: "음성 타이밍을 분석할 수 없습니다. 오디오를 확인해주세요." },
        { status: 422 }
      );
    }

    const subtitles: SubtitleEntry[] = script
      ? mapScriptToSegments(script, whisperSegs)
      : whisperSegs.map((s, i) => ({
          ...s,
          text: (transcription.segments ?? [])[i]?.text?.trim() ?? "",
        }));

    const subtitledVideoUrl = await burnSubtitles(videoUrl, subtitles, {
      style: style ?? "white",
      fontSize: fontSize ?? 24,
      fontName: fontName ?? "",
    });

    return NextResponse.json({ subtitles, subtitledVideoUrl });
  } catch (error) {
    console.error("Subtitle generation error:", error);
    return NextResponse.json(
      { error: "자막 생성 중 오류가 발생했습니다", detail: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Escape text for FFmpeg drawtext `text=` option value.
 * The value is single-quoted inside the filter string, which itself is
 * double-quoted when passed to the shell via exec().
 * Two escaping layers apply:
 *   1. Shell (double-quote context): \  "  $  `  must be backslash-escaped
 *   2. FFmpeg filter parser (single-quote context): '  :  {  }  must be escaped
 */
function escapeDrawtext(t: string): string {
  return t
    .replace(/\\/g, "\\\\")  // 1. backslash (must be first)
    .replace(/\$/g, "\\$")   // 2. dollar sign  — shell variable expansion
    .replace(/`/g, "\\`")    // 3. backtick     — shell command substitution
    .replace(/"/g, '\\"')    // 4. double quote — would close the outer "-vf "..." shell arg
    .replace(/'/g, "\\'")    // 5. single quote — FFmpeg filter single-quote delimiter
    .replace(/:/g, "\\:")    // 6. colon        — FFmpeg option separator
    .replace(/\{/g, "\\{")   // 7. open brace   — FFmpeg drawtext expansion
    .replace(/\}/g, "\\}");  // 8. close brace
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
  // Use forward-slash paths to avoid Windows backslash issues in FFmpeg args
  const tempVideo = path.join(tmpDir, `input-${ts}.mp4`).replace(/\\/g, "/");
  const outputVideo = path.join(tmpDir, `subtitled-${ts}.mp4`).replace(/\\/g, "/");

  try {
    // Download video
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`비디오 다운로드 실패: ${videoRes.status}`);
    await fs.writeFile(tempVideo, Buffer.from(await videoRes.arrayBuffer()));

    const { style, fontSize } = options;

    // Resolve Korean font (bundled in public/fonts/)
    const fontAbsPath = path.join(process.cwd(), "public", "fonts", "NanumGothic.ttf");
    let fontFilePart = "";
    try {
      await fs.access(fontAbsPath);
      // forward-slash path; no colon escaping needed inside single-quoted filter values
      fontFilePart = `:fontfile='${fontAbsPath.replace(/\\/g, "/")}'`;
      console.log("[subtitles] Using font:", fontAbsPath);
    } catch {
      console.warn("[subtitles] Font not found, using system default:", fontAbsPath);
    }

    const fontcolor = style === "yellow" ? "yellow" : "white";

    // Build one drawtext filter per subtitle.
    // Using text= directly (not textfile=) avoids temp-file path issues on Windows.
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

    console.log("[subtitles] FFmpeg: subtitle count =", subtitles.length);
    const { stderr } = await execAsync(cmd, {
      timeout: 180000,
      maxBuffer: 50 * 1024 * 1024,
    });
    if (stderr) console.log("[subtitles] FFmpeg stderr (tail):", stderr.slice(-800));

    // Upload to Supabase
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
