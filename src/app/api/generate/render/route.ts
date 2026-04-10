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

    // Download media files → all converted to JPEG frames for FFmpeg
    const sharp = (await import("sharp")).default;
    const imageFiles: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const imgRes = await fetch(imageUrls[i]);
      const contentType = imgRes.headers.get("content-type") ?? "";
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const imgFile = path.join(tmpDir, `img-${ts}-${i}.jpg`);

      const isVideo =
        contentType.startsWith("video/") ||
        /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(imageUrls[i]);

      if (isVideo) {
        // Save video temporarily, then extract first frame with FFmpeg
        const tempVid = path.join(tmpDir, `tmpvid-${ts}-${i}.mp4`);
        await fs.writeFile(tempVid, buf);
        await execAsync(
          `${FFMPEG} -i "${tempVid}" -vframes 1 -q:v 2 "${imgFile}" -y`,
          { timeout: 30000 }
        );
        await fs.unlink(tempVid).catch(() => {});
      } else {
        // Image: auto-rotate via EXIF, convert to JPEG
        await sharp(buf).rotate().jpeg({ quality: 90 }).toFile(imgFile);
      }

      imageFiles.push(imgFile);
    }

    // Build filter_complex: each image as a video segment, then concat
    const n = imageFiles.length;
    const inputs = imageFiles.map((f) => `-loop 1 -t ${secondsPerScene.toFixed(2)} -i "${f}"`).join(" ");
    const filterParts = imageFiles.map((_, i) =>
      `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[v${i}]`
    );
    const concatInputs = imageFiles.map((_, i) => `[v${i}]`).join("");
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
      ...imageFiles.map((f) => fs.unlink(f).catch(() => {})),
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
