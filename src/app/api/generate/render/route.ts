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

function escapeDrawtext(t: string): string {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\u2019") // single quote — replace with right curly quote (can't escape inside text='...')
    .replace(/:/g, "\\:")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

const INTRO_DURATION = 6;

export async function POST(req: NextRequest) {
  try {
    const {
      scenes, audioUrl, imageUrls,
      keyPhrase = "", introMusicId = "", addHighlightIntro = false,
      duration = "long",
    } = await req.json();

    const isShorts = duration === "short";
    const W = isShorts ? 720 : 1280;
    const H = isShorts ? 1280 : 720;

    if (!scenes || !audioUrl) {
      return NextResponse.json({ error: "필요한 데이터가 없습니다" }, { status: 400 });
    }

    const creditResult = await deductCredits(req, CREDIT_COSTS.render);
    if (creditResult instanceof NextResponse) return creditResult;

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

    const audioDuration: number = await new Promise((resolve, reject) => {
      ffmpegFluent.ffprobe(audioFile, (err: unknown, meta: { format: { duration?: number } }) => {
        if (err) reject(err);
        else resolve(meta.format.duration ?? 30);
      });
    });

    // Check if any explicitly-set slide scenes
    const hasSlides = scenes.some((s: { sceneType?: string }) => s.sceneType === "slide");

    if (hasSlides) {
      try {
        const { bundle } = await import("@remotion/bundler");
        const { renderMedia, selectComposition } = await import("@remotion/renderer");

        const fps = 30;
        const totalFrames = Math.ceil(audioDuration * fps);
        const framesPerScene = Math.floor(totalFrames / scenes.length);

        const remotionScenes = scenes.map((scene: { title: string; content: string; sceneType?: string }, i: number) => ({
          title: scene.title,
          content: scene.content,
          sceneType: scene.sceneType ?? "slide",
          imageUrl: imageUrls?.[i] ?? "",
          startFrame: i * framesPerScene,
          durationFrames: i === scenes.length - 1
            ? totalFrames - i * framesPerScene
            : framesPerScene,
        }));

        const bundled = await bundle({
          entryPoint: path.join(process.cwd(), "src/remotion/root.tsx"),
        });

        const composition = await selectComposition({
          serveUrl: bundled,
          id: "VideoComposition",
          inputProps: { scenes: remotionScenes, audioUrl },
        });

        const mainVideoFile = path.join(tmpDir, `video-${ts}.mp4`);

        await renderMedia({
          composition,
          serveUrl: bundled,
          codec: "h264",
          outputLocation: mainVideoFile,
          inputProps: { scenes: remotionScenes, audioUrl },
        });

        const { finalVideoFile, introAdded } = await applyIntro({
          mainVideoFile, audioDuration, keyPhrase, introMusicId, addHighlightIntro, FFMPEG, ts, tmpDir, W, H,
        });

        const supabase = createServiceClient();
        const videoBuffer = await fs.readFile(finalVideoFile);
        const fileName = `videos/video-${ts}.mp4`;
        const { error } = await supabase.storage.from("media").upload(fileName, videoBuffer, { contentType: "video/mp4" });
        if (error) throw error;
        const { data } = supabase.storage.from("media").getPublicUrl(fileName);

        await Promise.all([
          fs.unlink(audioFile).catch(() => {}),
          fs.unlink(mainVideoFile).catch(() => {}),
          finalVideoFile !== mainVideoFile ? fs.unlink(finalVideoFile).catch(() => {}) : Promise.resolve(),
        ]);

        return NextResponse.json({ videoUrl: data.publicUrl, introAdded });
      } catch (remotionErr) {
        console.error("[render] Remotion failed, falling back to FFmpeg:", remotionErr);
      }
    }

    // ── FFmpeg fallback / main path ──
    const sharp = (await import("sharp")).default;
    type MediaFile = { file: string; isVideo: boolean };
    const mediaFiles: MediaFile[] = [];
    const urls: string[] = imageUrls ?? [];
    const secondsPerScene = audioDuration / Math.max(scenes.length, 1);
    const fontAbsPath = path.join(process.cwd(), "public", "fonts", "NanumGothic.ttf");
    let hasFontFile = false;
    try { await fs.access(fontAbsPath); hasFontFile = true; } catch {}

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i] as { title: string; content: string; sceneType?: string };
      const isSlide = scene.sceneType === "slide";
      const url = urls[i];

      if (isSlide || !url) {
        // Generate text slide image using FFmpeg
        const slideFile = path.join(tmpDir, `slide-${ts}-${i}.jpg`);
        await generateTextSlide({ scene, slideFile, fontPath: hasFontFile ? fontAbsPath : "", FFMPEG, W, H });
        mediaFiles.push({ file: slideFile, isVideo: false });
      } else {
        const res = await fetch(url);
        const contentType = res.headers.get("content-type") ?? "";
        const buf = Buffer.from(await res.arrayBuffer());
        const isVideo = contentType.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(url);
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
    }

    const n = mediaFiles.length;
    const dur = secondsPerScene.toFixed(2);
    const inputs = mediaFiles.map(({ file, isVideo }) =>
      isVideo ? `-stream_loop -1 -t ${dur} -i "${file}"` : `-loop 1 -t ${dur} -i "${file}"`
    ).join(" ");
    const filterParts = mediaFiles.map((_, i) =>
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[v${i}]`
    );
    const concatInputs = mediaFiles.map((_, i) => `[v${i}]`).join("");

    // Shorts: add keyPhrase text overlay at top
    let finalConcatFilter: string;
    if (isShorts && keyPhrase?.trim()) {
      const titleText = keyPhrase.trim().substring(0, 18) + (keyPhrase.trim().length > 18 ? ".." : "");
      const safeTitle = escapeDrawtext(titleText);
      const boldFontPath = path.join(process.cwd(), "public", "fonts", "NanumGothic-ExtraBold.ttf");
      let boldFontPart = "";
      try { await fs.access(boldFontPath); boldFontPart = `:fontfile='${boldFontPath.replace(/\\/g, "/")}'`; } catch {}
      finalConcatFilter = [
        `${concatInputs}concat=n=${n}:v=1:a=0[vconcat]`,
        `[vconcat]drawbox=x=0:y=0:w=${W}:h=190:color=black@0.55:t=fill` +
        `,drawtext=text='${safeTitle}'${boldFontPart}:fontsize=60:fontcolor=white:borderw=5:bordercolor=white:x=(w-tw)/2:y=72:shadowx=5:shadowy=5:shadowcolor=black@0.95[vout]`,
      ].join(";");
    } else {
      finalConcatFilter = `${concatInputs}concat=n=${n}:v=1:a=0[vout]`;
    }

    const filterComplex = [...filterParts, finalConcatFilter].join(";");

    const mainVideoFile = path.join(tmpDir, `video-${ts}.mp4`);
    const audioFileFwd = audioFile.replace(/\\/g, "/");
    const mainVideoFileFwd = mainVideoFile.replace(/\\/g, "/");
    const mainCmd =
      `${FFMPEG} ${inputs} -i "${audioFileFwd}" -filter_complex "${filterComplex}" ` +
      `-map "[vout]" -map "${n}:a" -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest -movflags +faststart "${mainVideoFileFwd}" -y`;

    console.log("[render] FFmpeg render, duration:", audioDuration, "scenes:", scenes.length);
    await execAsync(mainCmd, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });

    const { finalVideoFile, introAdded } = await applyIntro({
      mainVideoFile, audioDuration, keyPhrase, introMusicId, addHighlightIntro, FFMPEG, ts, tmpDir, W, H,
    });

    const supabase = createServiceClient();
    const videoBuffer = await fs.readFile(finalVideoFile);
    const fileName = `videos/video-${ts}.mp4`;
    const { error } = await supabase.storage.from("media").upload(fileName, videoBuffer, { contentType: "video/mp4" });
    if (error) throw error;
    const { data } = supabase.storage.from("media").getPublicUrl(fileName);

    await Promise.all([
      fs.unlink(audioFile).catch(() => {}),
      fs.unlink(mainVideoFile).catch(() => {}),
      finalVideoFile !== mainVideoFile ? fs.unlink(finalVideoFile).catch(() => {}) : Promise.resolve(),
      ...mediaFiles.map(({ file }) => fs.unlink(file).catch(() => {})),
    ]);

    return NextResponse.json({ videoUrl: data.publicUrl, introAdded });
  } catch (error) {
    console.error("Render error:", error);
    return NextResponse.json({ error: "영상 렌더링 중 오류가 발생했습니다" }, { status: 500 });
  }
}

async function generateTextSlide({ scene, slideFile, fontPath, FFMPEG, W = 1280, H = 720 }: {
  scene: { title: string; content: string };
  slideFile: string;
  fontPath: string;
  FFMPEG: string;
  W?: number;
  H?: number;
}): Promise<void> {
  const fontPart = fontPath ? `:fontfile='${fontPath.replace(/\\/g, "/")}'` : "";
  const safeTitle = escapeDrawtext(scene.title.substring(0, 30));
  const shortContent = scene.content.substring(0, 55).trim() + (scene.content.length > 55 ? "..." : "");
  const safeContent = escapeDrawtext(shortContent);
  const outFwd = slideFile.replace(/\\/g, "/");

  const vf = [
    `drawtext=text='${safeTitle}'${fontPart}:fontsize=56:fontcolor=white:x=(w-tw)/2:y=(h/2)-80`,
    `drawtext=text='${safeContent}'${fontPart}:fontsize=28:fontcolor=0xaaaaaa:x=(w-tw)/2:y=(h/2)+40`,
  ].join(",");

  const cmd = `${FFMPEG} -f lavfi -i "color=c=0x0f172a:s=${W}x${H}:r=25" -vf "${vf}" -vframes 1 "${outFwd}" -y`;
  await execAsync(cmd, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
}

async function applyIntro({ mainVideoFile, audioDuration, keyPhrase, introMusicId, addHighlightIntro, FFMPEG, ts, tmpDir, W, H }: {
  mainVideoFile: string; audioDuration: number; keyPhrase: string; introMusicId: string;
  addHighlightIntro: boolean; FFMPEG: string; ts: number; tmpDir: string; W: number; H: number;
}): Promise<{ finalVideoFile: string; introAdded: boolean }> {
  if (!addHighlightIntro || !keyPhrase) return { finalVideoFile: mainVideoFile, introAdded: false };
  try {
    const introFile = path.join(tmpDir, `intro-${ts}.mp4`);
    const combinedFile = path.join(tmpDir, `combined-${ts}.mp4`);
    await buildHighlightIntro({ mainVideoFile, audioDuration, keyPhrase, introMusicId, FFMPEG, introFile, tmpDir, ts, W, H });
    await concatenateVideos({ introFile, mainVideoFile, outputFile: combinedFile, FFMPEG });
    await fs.unlink(introFile).catch(() => {});
    return { finalVideoFile: combinedFile, introAdded: true };
  } catch (e) {
    console.error("[render] Intro failed:", e);
    return { finalVideoFile: mainVideoFile, introAdded: false };
  }
}

async function buildHighlightIntro({ mainVideoFile, audioDuration, keyPhrase, introMusicId, FFMPEG, introFile, tmpDir, ts, W, H }: {
  mainVideoFile: string; audioDuration: number; keyPhrase: string;
  introMusicId: string; FFMPEG: string; introFile: string; tmpDir: string; ts: number; W: number; H: number;
}): Promise<void> {
  const startSec = Math.max(0, Math.min(audioDuration * 0.25, audioDuration - INTRO_DURATION - 1));
  const isVertical = H > W;

  // Use ExtraBold for Shorts, regular for landscape
  const boldFontPath = path.join(process.cwd(), "public", "fonts", "NanumGothic-ExtraBold.ttf");
  const regularFontPath = path.join(process.cwd(), "public", "fonts", "NanumGothic.ttf");
  let fontFilePart = "";
  try {
    await fs.access(isVertical ? boldFontPath : regularFontPath);
    fontFilePart = `:fontfile='${(isVertical ? boldFontPath : regularFontPath).replace(/\\/g, "/")}'`;
  } catch {}

  const safeText = escapeDrawtext(keyPhrase);
  const mainFwd = mainVideoFile.replace(/\\/g, "/");
  const introFwd = introFile.replace(/\\/g, "/");

  const vf = isVertical ? [
    // Shorts intro: fill vertical frame, color grade, centered text band
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`,
    `eq=contrast=1.15:saturation=0.65:brightness=-0.04`,
    `drawbox=x=0:y=${Math.floor(H / 2) - 65}:w=${W}:h=130:color=black@0.65:t=fill`,
    `drawtext=text='${safeText}'${fontFilePart}:fontsize=58:fontcolor=white:borderw=5:bordercolor=white:x=(w-tw)/2:y=(h-th)/2:shadowx=5:shadowy=5:shadowcolor=black@0.95`,
    `fade=t=in:st=0:d=0.7`,
    `fade=t=out:st=${INTRO_DURATION - 0.7}:d=0.7`,
  ].join(",") : [
    // Landscape intro: cinematic letterbox + color grade
    `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1`,
    `eq=contrast=1.15:saturation=0.65:brightness=-0.04`,
    `crop=1280:544:0:88,pad=1280:720:0:88:color=black`,
    `drawbox=x=0:y=300:w=1280:h=120:color=black@0.65:t=fill`,
    `drawtext=text='${safeText}'${fontFilePart}:fontsize=62:fontcolor=white:x=(w-tw)/2:y=(h-th)/2:shadowx=4:shadowy=4:shadowcolor=black@0.95`,
    `fade=t=in:st=0:d=0.7`,
    `fade=t=out:st=${INTRO_DURATION - 0.7}:d=0.7`,
  ].join(",");
  let useMusicFile = false;
  let musicFileFwd = "";
  let sfxTmpFile = "";
  if (introMusicId) {
    if (introMusicId.startsWith("http")) {
      // Generated SFX URL — download to tmp
      try {
        const sfxRes = await fetch(introMusicId);
        sfxTmpFile = path.join(tmpDir, `sfx-${ts}.mp3`);
        await fs.writeFile(sfxTmpFile, Buffer.from(await sfxRes.arrayBuffer()));
        musicFileFwd = sfxTmpFile.replace(/\\/g, "/");
        useMusicFile = true;
      } catch { /* ignore, fall through to no music */ }
    } else {
      const musicAbsPath = path.join(process.cwd(), "public", "music", `${introMusicId}.mp3`);
      try { await fs.access(musicAbsPath); musicFileFwd = musicAbsPath.replace(/\\/g, "/"); useMusicFile = true; } catch {}
    }
  }
  const cmd = useMusicFile
    ? `${FFMPEG} -ss ${startSec.toFixed(3)} -t ${INTRO_DURATION} -i "${mainFwd}" -i "${musicFileFwd}" -filter_complex "[0:v]${vf}[v];[1:a]atrim=0:${INTRO_DURATION},asetpts=PTS-STARTPTS,afade=t=out:st=${INTRO_DURATION - 2}:d=2[a]" -map "[v]" -map "[a]" -c:v libx264 -c:a aac -pix_fmt yuv420p "${introFwd}" -y`
    : `${FFMPEG} -ss ${startSec.toFixed(3)} -t ${INTRO_DURATION} -i "${mainFwd}" -f lavfi -i anullsrc=r=44100:cl=stereo -filter_complex "[0:v]${vf}[v];[1:a]atrim=0:${INTRO_DURATION}[a]" -map "[v]" -map "[a]" -c:v libx264 -c:a aac -pix_fmt yuv420p -t ${INTRO_DURATION} "${introFwd}" -y`;
  await execAsync(cmd, { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
}

async function concatenateVideos({ introFile, mainVideoFile, outputFile, FFMPEG }: {
  introFile: string; mainVideoFile: string; outputFile: string; FFMPEG: string;
}): Promise<void> {
  const cmd =
    `${FFMPEG} -i "${introFile.replace(/\\/g, "/")}" -i "${mainVideoFile.replace(/\\/g, "/")}"` +
    ` -filter_complex "[0:a]aresample=44100[a0];[1:a]aresample=44100[a1];[0:v][a0][1:v][a1]concat=n=2:v=1:a=1[v][a]"` +
    ` -map "[v]" -map "[a]" -c:v libx264 -c:a aac -pix_fmt yuv420p -movflags +faststart "${outputFile.replace(/\\/g, "/")}" -y`;
  await execAsync(cmd, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });
}
