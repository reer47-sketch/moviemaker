import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
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

/** Normalize text for fuzzy comparison: remove spaces/punctuation, lowercase */
function normText(s: string): string {
  return s.replace(/[\s\.,!?。、·\-:;'"()[\]]/g, "").toLowerCase();
}

/**
 * Dice coefficient on characters: 2 * |intersection| / (|a| + |b|)
 * Works well for Korean (preserves CJK chars) and Latin.
 */
function charDice(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  const pool = b.split("");
  let matches = 0;
  for (const c of a) {
    const idx = pool.indexOf(c);
    if (idx !== -1) { matches++; pool.splice(idx, 1); }
  }
  return (2 * matches) / (a.length + b.length);
}

/**
 * Map script sentences to STT word timestamps via fuzzy matching.
 *
 * Strategy: for each sentence (in order) find the window of consecutive STT
 * words whose concatenated text best matches the sentence text (Dice on chars).
 * A sequential cursor prevents sentences from matching out of order.
 * Falls back to time-ratio if the best fuzzy score is very low.
 */
function mapScriptToWordTimestamps(
  script: string,
  words: ElevenLabsWord[]
): SubtitleEntry[] {
  const spokenWords = words.filter((w) => w.type === "word" && w.start != null);
  if (!spokenWords.length) return [];

  const sentences = splitIntoSentences(script);
  if (!sentences.length) return [];

  const totalNormChars = sentences.reduce((s, sen) => s + normText(sen).length, 0);

  // Time-ratio fallback values
  const speechStart = spokenWords[0].start;
  const totalSpeechDuration = spokenWords[spokenWords.length - 1].end - speechStart;
  let charAccumFallback = 0;

  let cursor = 0; // sequential search start

  const entries = sentences.map((sentence) => {
    const sentNorm = normText(sentence);
    const sentChars = sentNorm.length;

    // Estimated word count for this sentence (used to set search window size)
    const estWords = Math.max(1, Math.round((sentChars / totalNormChars) * spokenWords.length));

    // Search window: give 3× slack forward from cursor, never go backwards
    const searchEnd = Math.min(spokenWords.length, cursor + estWords * 3 + 6);

    let bestScore = -1;
    let bestWs = cursor;
    let bestWe = Math.min(cursor + estWords - 1, spokenWords.length - 1);

    // Sliding window: vary start and size
    for (let ws = cursor; ws < searchEnd; ws++) {
      let running = "";
      for (let we = ws; we < Math.min(ws + estWords * 2 + 3, searchEnd); we++) {
        running += normText(spokenWords[we].text);
        const score = charDice(sentNorm, running);
        if (score > bestScore) {
          bestScore = score;
          bestWs = ws;
          bestWe = we;
        }
      }
    }

    // If fuzzy match confidence is very low, fall back to time-ratio
    charAccumFallback += sentChars;
    if (bestScore < 0.25) {
      const estTime = speechStart + (charAccumFallback / totalNormChars) * totalSpeechDuration;
      const fallbackWord = spokenWords.reduce((b, w) =>
        Math.abs(w.start - estTime) < Math.abs(b.start - estTime) ? w : b
      );
      bestWs = spokenWords.indexOf(fallbackWord);
      bestWe = Math.min(bestWs + estWords - 1, spokenWords.length - 1);
    }

    cursor = bestWe + 1;

    const safeWs = Math.min(bestWs, spokenWords.length - 1);
    const safeWe = Math.min(bestWe, spokenWords.length - 1);

    return {
      start: Math.round(spokenWords[safeWs].start * 1000) / 1000,
      end:   Math.round(spokenWords[safeWe].end   * 1000) / 1000,
      text:  sentence,
    };
  });

  // Add 50ms gap between subtitles to prevent overlap
  const GAP = 0.05;
  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].end >= entries[i + 1].start) {
      entries[i].end = Math.max(entries[i].start + 0.1, entries[i + 1].start - GAP);
      entries[i].end = Math.round(entries[i].end * 1000) / 1000;
    }
  }

  return entries;
}

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, videoUrl, script, style, fontSize, fontName, subtitlePosition = 50, introOffset = 0, language = "ko" } =
      await req.json();

    if (!audioUrl || !videoUrl) {
      return NextResponse.json(
        { error: "오디오와 비디오 URL이 필요합니다" },
        { status: 400 }
      );
    }

    const creditResult = await deductCredits(req, CREDIT_COSTS.subtitles);
    if (creditResult instanceof NextResponse) return creditResult;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

    // Download audio
    const audioRes = await fetch(audioUrl);
    const audioBuffer = await audioRes.arrayBuffer();

    // Call ElevenLabs STT (scribe_v1) — returns word-level timestamps
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
    formData.append("model_id", "scribe_v2");
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
      subtitlePosition: subtitlePosition ?? 50,
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

/** Break text into at most 2 lines if it exceeds maxChars */
function wrapText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const mid = Math.ceil(text.length / 2);
  let breakAt = mid;
  for (let d = 1; d <= 8; d++) {
    if (mid - d >= 0 && text[mid - d] === " ") { breakAt = mid - d; break; }
    if (mid + d < text.length && text[mid + d] === " ") { breakAt = mid + d + 1; break; }
  }
  return text.substring(0, breakAt).trim() + "\n" + text.substring(breakAt).trim();
}

function escapeDrawtext(t: string): string {
  return t
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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
  options: { style: string; fontSize: number; fontName: string; subtitlePosition: number }
): Promise<string> {
  const ffmpegRaw = (await import("ffmpeg-static")).default ?? "";
  const FFMPEG = `"${ffmpegRaw.replace(/^\/ROOT\//, "/var/task/")}"`;

  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const tempVideo = path.join(tmpDir, `input-${ts}.mp4`).replace(/\\/g, "/");
  const outputVideo = path.join(tmpDir, `subtitled-${ts}.mp4`).replace(/\\/g, "/");

  try {
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`비디오 다운로드 실패: ${videoRes.status}`);
    await fs.writeFile(tempVideo, Buffer.from(await videoRes.arrayBuffer()));

    const { style, fontSize, subtitlePosition } = options;

    // Detect video width via ffprobe to handle vertical (Shorts) videos
    const ffprobeInstaller = await import("@ffprobe-installer/ffprobe");
    const ffmpegFluent = (await import("fluent-ffmpeg")).default;
    ffmpegFluent.setFfprobePath(ffprobeInstaller.path);
    const videoWidth: number = await new Promise((resolve) => {
      ffmpegFluent.ffprobe(tempVideo, (_err: unknown, meta: any) => {
        const stream = meta?.streams?.find((s: any) => s.codec_type === "video");
        resolve(stream?.width ?? 1280);
      });
    });
    // chars per line: each Korean char ≈ fontSize px wide, with 10% padding
    const charsPerLine = Math.floor((videoWidth * 0.9) / (fontSize * 1.1));

    const fontAbsPath = path.join(process.cwd(), "public", "fonts", "NanumGothic.ttf");
    let fontFilePart = "";
    try {
      await fs.access(fontAbsPath);
      fontFilePart = `:fontfile='${fontAbsPath.replace(/\\/g, "/")}'`;
    } catch {
      console.warn("[subtitles] Font not found, using system default");
    }

    const fontcolor = style === "yellow" ? "yellow" : "white";

    // Build one drawtext per line (avoids \n shell-escaping issues on Windows)
    const lineHeight = Math.round(fontSize * 1.4);
    const filters: string[] = [];
    for (const sub of subtitles) {
      const wrapped = wrapText(sub.text, charsPerLine);
      const lines = wrapped.split("\n");
      const ts0 = sub.start.toFixed(3);
      const ts1 = sub.end.toFixed(3);

      lines.forEach((line, i) => {
        const safeText = escapeDrawtext(line);
        // Stack lines from bottom: last line at subtitlePosition, earlier lines above it
        const yVal = `h-th-${subtitlePosition + (lines.length - 1 - i) * lineHeight}`;

        let f =
          `drawtext=text='${safeText}'` +
          `:enable='between(t,${ts0},${ts1})'` +
          fontFilePart +
          `:fontsize=${fontSize}` +
          `:fontcolor=${fontcolor}` +
          `:x=(w-tw)/2` +
          `:y=${yVal}`;

        if (style === "outline") {
          f += `:shadowcolor=black@0.8:shadowx=2:shadowy=2`;
        } else {
          f += `:box=1:boxcolor=black@0.5:boxborderw=8`;
        }
        filters.push(f);
      });
    }

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
