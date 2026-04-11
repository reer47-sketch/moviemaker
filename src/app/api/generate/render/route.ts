import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const maxDuration = 300;

/** Escape text for FFmpeg drawtext `text=` value inside single quotes. */
function escapeDrawtext(t: string): string {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

const INTRO_DURATION = 6; // seconds

export async function POST(req: NextRequest) {
  try {
    const {
      scenes, audioUrl, imageUrls,
      keyPhrase = "", introMusicId = "", addHighlightIntro = false,
    } = await req.json();

    if (!scenes || !audioUrl || !imageUrls?.length) {
      return NextResponse.json({ error: "필요한 데이터가 없습니다" }, { status: 400 });
    }

    const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
    const ffprobeInstaller = await import("@ffprobe-installer/ffprobe");
    const ffmpegFluent = (await import("fluent-ffmpeg")).default;
    ffmpegFluent.setFfprobePath(ffprobeInstaller.path);

    const FFMPEG = `"${ffmpegInstaller.path}"`;
    const tmpDir = os.tmpdir();
    const ts = Date.now();

    // Download audio
    const audioRes = await fetch(audioUrl);
    const audioFile = path.join(tmpDir, `audio-${ts}.mp3`);
    await fs.writeFile(audioFile, Buffer.from(await audioRes.arrayBuffer()));

    // Get audio duration
    const audioDuration: number = await new Promise((resolve, reject) => {
      ffmpegFluent.ffprobe(audioFile, (err: unknown, meta: { format: { duration?: number } }) => {
        if (err) reject(err);
        else resolve(meta.format.duration ?? 30);
      });
    });

    const secondsPerScene = audioDuration / scenes.length;

    // Download media — images → JPEG (sharp), videos → kept as-is
    const sharp = (await import("sharp")).default;
    type MediaFile = { file: string; isVideo: boolean };
    const mediaFiles: MediaFile[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const res = await fetch(imageUrls[i]);
      const contentType = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());

      const isVideo =
        contentType.startsWith("video/") ||
        /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(imageUrls[i]);

      if (isVideo) {
        const vidFile = path.join(tmpDir, `vid-${ts}-${i}.mp4`);
        await fs.writeFile(vidFile, buf);
        mediaFiles.push({ file: vidFile, isVideo: true });
      } else {
        const imgFile = path.join(tmpDir, `img-${ts}-${i}.jpg`);
        await sharp(buf).rotate().jpeg({ quality: 90 }).toFile(imgFile);
        mediaFiles.push({ file: imgFile, isVideo: false });
      }
    }

    // Build FFmpeg inputs
    const n = mediaFiles.length;
    const dur = secondsPerScene.toFixed(2);
    const inputs = mediaFiles
      .map(({ file, isVideo }) =>
        isVideo
          ? `-stream_loop -1 -t ${dur} -i "${file}"`
          : `-loop 1 -t ${dur} -i "${file}"`
      )
      .join(" ");

    const filterParts = mediaFiles.map((_, i) =>
      `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[v${i}]`
    );
    const concatInputs = mediaFiles.map((_, i) => `[v${i}]`).join("");
    const filterComplex = [...filterParts, `${concatInputs}concat=n=${n}:v=1:a=0[vout]`].join(";");

    const mainVideoFile = path.join(tmpDir, `video-${ts}.mp4`);
    const audioFileFwd = audioFile.replace(/\\/g, "/");
    const mainVideoFileFwd = mainVideoFile.replace(/\\/g, "/");

    const mainCmd =
      `${FFMPEG} ${inputs} -i "${audioFileFwd}" -filter_complex "${filterComplex}" ` +
      `-map "[vout]" -map "${n}:a" -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest -movflags +faststart "${mainVideoFileFwd}" -y`;

    await execAsync(mainCmd, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });

    let finalVideoFile = mainVideoFile;

    // Build highlight intro if requested
    if (addHighlightIntro && keyPhrase) {
      try {
        const introFile = path.join(tmpDir, `intro-${ts}.mp4`);
        const combinedFile = path.join(tmpDir, `combined-${ts}.mp4`);

        await buildHighlightIntro({
          mainVideoFile,
          audioDuration,
          keyPhrase,
          introMusicId,
          FFMPEG,
          introFile,
        });

        await concatenateVideos({ introFile, mainVideoFile, outputFile: combinedFile, FFMPEG });

        finalVideoFile = combinedFile;
        await fs.unlink(introFile).catch(() => {});
      } catch (introErr) {
        // Intro failed — continue with main video only
        console.error("[render] Highlight intro failed, using main video:", introErr);
      }
    }

    // Upload to Supabase
    const supabase = createServiceClient();
    const videoBuffer = await fs.readFile(finalVideoFile);
    const fileName = `videos/video-${ts}.mp4`;

    const { error } = await supabase.storage
      .from("media")
      .upload(fileName, videoBuffer, { contentType: "video/mp4" });

    if (error) throw error;

    const { data } = supabase.storage.from("media").getPublicUrl(fileName);

    // Cleanup
    await Promise.all([
      fs.unlink(audioFile).catch(() => {}),
      fs.unlink(mainVideoFile).catch(() => {}),
      finalVideoFile !== mainVideoFile ? fs.unlink(finalVideoFile).catch(() => {}) : Promise.resolve(),
      ...mediaFiles.map(({ file }) => fs.unlink(file).catch(() => {})),
    ]);

    return NextResponse.json({ videoUrl: data.publicUrl });
  } catch (error) {
    console.error("Render error:", error);
    return NextResponse.json(
      { error: "영상 렌더링 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

async function buildHighlightIntro({
  mainVideoFile,
  audioDuration,
  keyPhrase,
  introMusicId,
  FFMPEG,
  introFile,
}: {
  mainVideoFile: string;
  audioDuration: number;
  keyPhrase: string;
  introMusicId: string;
  FFMPEG: string;
  introFile: string;
}): Promise<void> {
  // Start at 25% of main video, clamped so we don't overshoot
  const startSec = Math.max(0, Math.min(
    audioDuration * 0.25,
    audioDuration - INTRO_DURATION - 1
  ));

  // Korean font for text overlay
  const fontAbsPath = path.join(process.cwd(), "public", "fonts", "NanumGothic.ttf");
  let fontFilePart = "";
  try {
    await fs.access(fontAbsPath);
    fontFilePart = `:fontfile='${fontAbsPath.replace(/\\/g, "/")}'`;
  } catch {
    console.warn("[render] Intro font not found:", fontAbsPath);
  }

  const safeText = escapeDrawtext(keyPhrase);
  const mainFwd = mainVideoFile.replace(/\\/g, "/");
  const introFwd = introFile.replace(/\\/g, "/");

  // Video filter: scale → text overlay → fade in/out
  const vf = [
    `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    `drawtext=text='${safeText}'${fontFilePart}:fontsize=52:fontcolor=white:x=(w-tw)/2:y=(h-th)/2:box=1:boxcolor=black@0.5:boxborderw=20`,
    `fade=t=in:st=0:d=1`,
    `fade=t=out:st=${INTRO_DURATION - 1}:d=1`,
  ].join(",");

  let cmd: string;

  // Check if music file actually exists (user may not have added MP3s yet)
  let useMusicFile = false;
  let musicFileFwd = "";
  if (introMusicId) {
    const musicAbsPath = path.join(process.cwd(), "public", "music", `${introMusicId}.mp3`);
    try {
      await fs.access(musicAbsPath);
      musicFileFwd = musicAbsPath.replace(/\\/g, "/");
      useMusicFile = true;
    } catch {
      console.warn(`[render] Music file not found: ${musicAbsPath}, using silence`);
    }
  }

  if (useMusicFile) {
    cmd =
      `${FFMPEG} -ss ${startSec.toFixed(3)} -t ${INTRO_DURATION} -i "${mainFwd}" -i "${musicFileFwd}"` +
      ` -filter_complex "[0:v]${vf}[v];[1:a]atrim=0:${INTRO_DURATION},asetpts=PTS-STARTPTS,afade=t=out:st=${INTRO_DURATION - 2}:d=2[a]"` +
      ` -map "[v]" -map "[a]" -c:v libx264 -c:a aac -pix_fmt yuv420p "${introFwd}" -y`;
  } else {
    // Silent audio via lavfi (no music file or file not found)
    cmd =
      `${FFMPEG} -ss ${startSec.toFixed(3)} -t ${INTRO_DURATION} -i "${mainFwd}" -f lavfi -i anullsrc=r=44100:cl=stereo` +
      ` -filter_complex "[0:v]${vf}[v];[1:a]atrim=0:${INTRO_DURATION}[a]"` +
      ` -map "[v]" -map "[a]" -c:v libx264 -c:a aac -pix_fmt yuv420p -t ${INTRO_DURATION} "${introFwd}" -y`;
  }

  await execAsync(cmd, { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
}

async function concatenateVideos({
  introFile,
  mainVideoFile,
  outputFile,
  FFMPEG,
}: {
  introFile: string;
  mainVideoFile: string;
  outputFile: string;
  FFMPEG: string;
}): Promise<void> {
  const introFwd = introFile.replace(/\\/g, "/");
  const mainFwd = mainVideoFile.replace(/\\/g, "/");
  const outputFwd = outputFile.replace(/\\/g, "/");

  const cmd =
    `${FFMPEG} -i "${introFwd}" -i "${mainFwd}"` +
    ` -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]"` +
    ` -map "[v]" -map "[a]" -c:v libx264 -c:a aac -pix_fmt yuv420p -movflags +faststart "${outputFwd}" -y`;

  await execAsync(cmd, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });
}
