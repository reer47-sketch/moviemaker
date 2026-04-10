import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase";
import os from "os";
import path from "path";
import fs from "fs/promises";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type SubtitleEntry = { start: number; end: number; text: string };

export async function POST(req: NextRequest) {
  try {
    const { audioUrl, videoUrl, style } = await req.json();

    if (!audioUrl || !videoUrl) {
      return NextResponse.json({ error: "오디오와 비디오 URL이 필요합니다" }, { status: 400 });
    }

    // Download audio for Whisper
    const audioRes = await fetch(audioUrl);
    const audioBuffer = await audioRes.arrayBuffer();
    const audioFile = new File([audioBuffer], "audio.mp3", { type: "audio/mpeg" });

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "ko",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    const subtitles: SubtitleEntry[] = (transcription.segments ?? []).map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    }));

    // Burn subtitles into video
    const subtitledVideoUrl = await burnSubtitles(videoUrl, subtitles, style);

    return NextResponse.json({ subtitles, subtitledVideoUrl });
  } catch (error) {
    console.error("Subtitle generation error:", error);
    return NextResponse.json(
      { error: "자막 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

async function burnSubtitles(
  videoUrl: string,
  subtitles: SubtitleEntry[],
  style: string
): Promise<string> {
  const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
  const ffprobeInstaller = await import("@ffprobe-installer/ffprobe");
  const ffmpeg = (await import("fluent-ffmpeg")).default;
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  ffmpeg.setFfprobePath(ffprobeInstaller.path);

  const tmpDir = os.tmpdir();
  const tempVideo = path.join(tmpDir, `input-${Date.now()}.mp4`);
  const srtFile = path.join(tmpDir, `subs-${Date.now()}.srt`);
  const outputVideo = path.join(tmpDir, `subtitled-${Date.now()}.mp4`);

  try {
    // Download video
    const videoRes = await fetch(videoUrl);
    const videoBuffer = await videoRes.arrayBuffer();
    await fs.writeFile(tempVideo, Buffer.from(videoBuffer));

    // Generate SRT
    const formatTime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      const ms = Math.round((s % 1) * 1000);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
    };

    const srtContent = subtitles
      .map((sub, i) => `${i + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}`)
      .join("\n\n");

    await fs.writeFile(srtFile, srtContent, "utf-8");

    // Style
    const fontColor = style === "yellow" ? "&H0000FFFF" : "&H00FFFFFF";
    const backColor = style === "outline" ? "&H00000000" : "&H80000000";
    const borderStyle = style === "outline" ? "3" : "4";
    const outline = style === "outline" ? "3" : "1";

    const srtPathEscaped = srtFile.replace(/\\/g, "/").replace(/:/g, "\\:");

    // Burn with ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideo)
        .videoFilters(
          `subtitles='${srtPathEscaped}':force_style='FontSize=22,PrimaryColour=${fontColor},BackColour=${backColor},BorderStyle=${borderStyle},Outline=${outline},Alignment=2'`
        )
        .audioCodec("copy")
        .output(outputVideo)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    // Upload to Supabase
    const supabase = createServiceClient();
    const outputBuffer = await fs.readFile(outputVideo);
    const fileName = `videos/subtitled-${Date.now()}.mp4`;

    const { error } = await supabase.storage
      .from("media")
      .upload(fileName, outputBuffer, { contentType: "video/mp4" });

    if (error) throw error;

    const { data } = supabase.storage.from("media").getPublicUrl(fileName);
    return data.publicUrl;
  } catch (e) {
    console.error("FFmpeg error, returning original video:", e);
    return videoUrl;
  } finally {
    await Promise.all([
      fs.unlink(tempVideo).catch(() => {}),
      fs.unlink(srtFile).catch(() => {}),
      fs.unlink(outputVideo).catch(() => {}),
    ]);
  }
}
