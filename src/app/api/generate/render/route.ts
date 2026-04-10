import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const { scenes, audioUrl, imageUrls } = await req.json();

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
      ffmpegFluent.ffprobe(audioFile, (err: any, meta: any) => {
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

    // Build FFmpeg inputs:
    //   이미지 → -loop 1 -t N (정지 이미지를 N초 동안)
    //   영상   → -stream_loop -1 -t N (영상 클립을 N초로 트림/루프)
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

    const outputFile = path.join(tmpDir, `video-${ts}.mp4`);
    const audioArg = `-i "${audioFile}"`;

    const cmd = `${FFMPEG} ${inputs} ${audioArg} -filter_complex "${filterComplex}" -map "[vout]" -map "${n}:a" -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest -movflags +faststart "${outputFile}" -y`;

    await execAsync(cmd, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });

    // Upload to Supabase
    const supabase = createServiceClient();
    const videoBuffer = await fs.readFile(outputFile);
    const fileName = `videos/video-${ts}.mp4`;

    const { error } = await supabase.storage
      .from("media")
      .upload(fileName, videoBuffer, { contentType: "video/mp4" });

    if (error) throw error;

    const { data } = supabase.storage.from("media").getPublicUrl(fileName);

    // Cleanup
    await Promise.all([
      fs.unlink(audioFile).catch(() => {}),
      fs.unlink(outputFile).catch(() => {}),
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
