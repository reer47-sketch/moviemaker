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

/**
 * Split text into at most 2 lines that fit within the given pixel width.
 * Returns [line1, line2?]. Reduces fontSize until both lines fit.
 */
function fitTextLines(
  text: string, W: number, fontSize: number, minFontSize = 24
): { lines: string[]; fontSize: number } {
  let fs = fontSize;
  while (fs >= minFontSize) {
    const charPx = fs * 0.65; // approximate width per char (bold Latin/Korean)
    const maxChars = Math.floor((W * 0.88) / charPx);
    if (text.length <= maxChars) return { lines: [text], fontSize: fs };
    if (text.length <= maxChars * 2) {
      const mid = Math.ceil(text.length / 2);
      let split = mid;
      for (let d = 1; d <= 10; d++) {
        if (text[mid - d] === " ") { split = mid - d; break; }
        if (text[mid + d] === " ") { split = mid + d; break; }
      }
      return {
        lines: [text.slice(0, split).trim(), text.slice(split).trim()],
        fontSize: fs,
      };
    }
    fs -= 4;
  }
  // Still too long: hard-truncate to 2 lines
  const charPx = minFontSize * 0.65;
  const maxChars = Math.floor((W * 0.88) / charPx);
  return {
    lines: [text.slice(0, maxChars).trim(), text.slice(maxChars, maxChars * 2).trim()],
    fontSize: minFontSize,
  };
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

const INTRO_DURATION = 6;
const XFADE_DURATION = 0.5;

/**
 * Fade transition: each clip fades out at end / fades in at start, then concat.
 * Avoids blend filter color artifacts (pink flash from rgb24↔yuv420p conversion).
 * 0.3s fade duration — barely noticeable, clean black dip.
 */
function buildFadeTransition(n: number, D: number, T: number, outLabel: string): string {
  const safeT = Math.min(T, D / 3);
  const parts = Array.from({ length: n }, (_, i) => {
    const fadeIn  = i > 0     ? `,fade=t=in:st=0:d=${safeT}`                            : "";
    const fadeOut = i < n - 1 ? `,fade=t=out:st=${(D - safeT).toFixed(3)}:d=${safeT}`  : "";
    const filters = fadeIn || fadeOut ? `${fadeIn || ""}${fadeOut || ""}`.replace(/^,/, "") : "copy";
    return `[v${i}]${filters}[f${i}]`;
  });
  const concatIn = Array.from({ length: n }, (_, i) => `[f${i}]`).join("");
  parts.push(`${concatIn}concat=n=${n}:v=1:a=0[${outLabel}]`);
  return parts.join(";");
}

/** Get media duration by parsing ffmpeg -i stderr (replaces ffprobe) */
async function getMediaDuration(ffmpegPath: string, filePath: string): Promise<number> {
  let stderr = "";
  try {
    await execAsync(`"${ffmpegPath}" -i "${filePath.replace(/\\/g, "/")}"`, { timeout: 30000 });
  } catch (e: any) { stderr = e.stderr ?? ""; }
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
  return 30;
}

/** Get video width by parsing ffmpeg -i stderr */
async function getVideoWidth(ffmpegPath: string, filePath: string): Promise<number> {
  let stderr = "";
  try {
    await execAsync(`"${ffmpegPath}" -i "${filePath.replace(/\\/g, "/")}"`, { timeout: 30000 });
  } catch (e: any) { stderr = e.stderr ?? ""; }
  const m = stderr.match(/Video:.*?(\d{3,4})x(\d{3,4})/);
  return m ? parseInt(m[1]) : 1280;
}

/** Ken Burns zoom/pan filter for a static image — pattern cycles across scenes */
function kenBurnsFilter(sceneIdx: number, nFrames: number, W: number, H: number): string {
  // Input is scaled to 2× target before zoompan, so iw=2W, ih=2H
  // round() on x/y prevents sub-pixel jitter (wobbling effect)
  switch (sceneIdx % 4) {
    case 0: // slow zoom-in from center
      return `zoompan=z='min(zoom+0.0008,1.5)':d=${nFrames}:x='round(iw/2-(iw/zoom/2))':y='round(ih/2-(ih/zoom/2))':s=${W}x${H}`;
    case 1: // slow zoom-out from center
      return `zoompan=z='if(eq(on,1),1.5,max(zoom-0.0008,1.0))':d=${nFrames}:x='round(iw/2-(iw/zoom/2))':y='round(ih/2-(ih/zoom/2))':s=${W}x${H}`;
    case 2: // pan left → right
      return `zoompan=z=1.3:d=${nFrames}:x='round(min(on*(iw*(1-1/1.3))/${nFrames},iw*(1-1/1.3)))':y='round(ih/2-(ih/1.3/2))':s=${W}x${H}`;
    default: // pan right → left
      return `zoompan=z=1.3:d=${nFrames}:x='round(max(iw*(1-1/1.3)*(1-on/${nFrames}),0))':y='round(ih/2-(ih/1.3/2))':s=${W}x${H}`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      scenes, audioUrl, imageUrls,
      keyPhrase = "", introMusicId = "", addHighlightIntro = false,
      duration = "long",
      keyFontSize = 58, keyFontColor = "white", keyFontName = "NanumGothic-ExtraBold", keyTextPosition = 8,
      kenBurns = true,
      transition = "fade", // "none" | "fade"
      introStyle = "cinematic", // "cinematic" | "title_card"
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
    const FFMPEG = `"${ffmpegInstaller.path}"`;
    const FFMPEG_DT = FFMPEG;

    const ffprobeInstaller = await import("@ffprobe-installer/ffprobe");
    const ffmpegFluent = (await import("fluent-ffmpeg")).default;
    ffmpegFluent.setFfprobePath(ffprobeInstaller.path);

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

    // ── FFmpeg path ──
    const sharp = (await import("sharp")).default;
    type MediaFile = { file: string; isVideo: boolean };
    const mediaFiles: MediaFile[] = [];
    const urls: string[] = imageUrls ?? [];
    const n = scenes.length || 1;
    const secondsPerScene = audioDuration / Math.max(n, 1);

    const adjustedSec = secondsPerScene;
    const dur = adjustedSec.toFixed(3);
    const nFrames = Math.ceil(adjustedSec * 25);

    const fontAbsPath = path.join(process.cwd(), "public", "fonts", "NanumGothic.ttf");
    let hasFontFile = false;
    try { await fs.access(fontAbsPath); hasFontFile = true; } catch {}

    for (let i = 0; i < n; i++) {
      const scene = scenes[i] as { title: string; content: string; sceneType?: string };
      const isSlide = scene.sceneType === "slide";
      const url = urls[i];

      if (isSlide || !url) {
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

    const inputs = mediaFiles.map(({ file, isVideo }) =>
      isVideo ? `-stream_loop -1 -t ${dur} -i "${file}"` : `-loop 1 -t ${dur} -i "${file}"`
    ).join(" ");

    // Per-scene filters: Ken Burns for static images, plain scale for videos
    // Shorts: letterbox (decrease+pad) so full image visible with black bars top/bottom
    // Non-Shorts: fill mode (increase+crop) for Ken Burns so zoompan works on real content
    const filterParts = mediaFiles.map(({ isVideo }, i) => {
      if (!isVideo && kenBurns && !isShorts) {
        const kb = kenBurnsFilter(i, nFrames, W, H);
        return `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=25,${kb},setsar=1,setpts=PTS-STARTPTS[v${i}]`;
      }
      if (!isVideo && kenBurns && isShorts) {
        const kb = kenBurnsFilter(i, nFrames, W, H);
        return `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=25,${kb},setsar=1,setpts=PTS-STARTPTS[v${i}]`;
      }
      return `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,setpts=PTS-STARTPTS[v${i}]`;
    });

    const concatInputs = mediaFiles.map((_, i) => `[v${i}]`).join("");

    let transitionFilter: string;
    if (n === 1) {
      transitionFilter = `[v0]copy[vout]`;
    } else if (transition === "fade") {
      transitionFilter = buildFadeTransition(n, adjustedSec, 0.3, "vout");
    } else {
      transitionFilter = `${concatInputs}concat=n=${n}:v=1:a=0[vout]`;
    }

    const filterComplex = [...filterParts, transitionFilter].join(";");

    const rawVideoFile = path.join(tmpDir, `raw-${ts}.mp4`);
    const audioFileFwd = audioFile.replace(/\\/g, "/");
    const mainCmd =
      `${FFMPEG} ${inputs} -i "${audioFileFwd}" -filter_complex "${filterComplex}" ` +
      `-map "[vout]" -map "${n}:a" -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest -movflags +faststart "${rawVideoFile.replace(/\\/g, "/")}" -y`;

    console.log("[render] FFmpeg render — scenes:", n, "kenBurns:", kenBurns, "transition:", transition);
    await execAsync(mainCmd, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });

    // Step 2: Shorts keyPhrase overlay via FFMPEG_DT
    let mainVideoFile = rawVideoFile;
    if (isShorts && keyPhrase?.trim()) {
      const overlayFile = path.join(tmpDir, `overlay-${ts}.mp4`);
      const { lines, fontSize: fitFs } = fitTextLines(keyPhrase.trim(), W, keyFontSize);
      const shortsFont = path.join(process.cwd(), "public", "fonts", `${keyFontName}.ttf`);
      let fontPart = "";
      try { await fs.access(shortsFont); fontPart = `:fontfile='${shortsFont.replace(/\\/g, "/")}'`; } catch {}
      const centerY = Math.floor(H * keyTextPosition / 100);
      const lineH = Math.round(fitFs * 1.35);
      const totalH = lines.length * lineH + 20;
      const boxY = Math.max(0, centerY - Math.floor(totalH / 2) - 10);
      const dtFilters = lines.map((line, li) => {
        const lineY = centerY - Math.floor((lines.length * lineH) / 2) + li * lineH;
        return `drawtext=text='${escapeDrawtext(line)}'${fontPart}:fontsize=${fitFs}:fontcolor=${keyFontColor}:borderw=2:bordercolor=${keyFontColor}:x=(w-tw)/2:y=${lineY}:shadowx=3:shadowy=3:shadowcolor=black@0.9`;
      });
      const vfOverlay = `drawbox=x=0:y=${boxY}:w=${W}:h=${totalH}:color=black@0.55:t=fill,${dtFilters.join(",")}`;
      const overlayCmd =
        `${FFMPEG_DT} -i "${rawVideoFile.replace(/\\/g, "/")}" -vf "${vfOverlay}" ` +
        `-c:v libx264 -c:a copy -pix_fmt yuv420p -movflags +faststart "${overlayFile.replace(/\\/g, "/")}" -y`;
      await execAsync(overlayCmd, { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
      await fs.unlink(rawVideoFile).catch(() => {});
      mainVideoFile = overlayFile;
    }

    const { finalVideoFile, introAdded } = await applyIntro({
      mainVideoFile, audioDuration, keyPhrase, introMusicId, addHighlightIntro,
      FFMPEG: FFMPEG_DT, ts, tmpDir, W, H, keyFontSize, keyFontColor, keyFontName, keyTextPosition, introStyle,
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
      (finalVideoFile !== mainVideoFile && finalVideoFile !== rawVideoFile) ? fs.unlink(finalVideoFile).catch(() => {}) : Promise.resolve(),
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

async function applyIntro({ mainVideoFile, audioDuration, keyPhrase, introMusicId, addHighlightIntro, FFMPEG, ts, tmpDir, W, H, keyFontSize, keyFontColor, keyFontName, keyTextPosition, introStyle }: {
  mainVideoFile: string; audioDuration: number; keyPhrase: string; introMusicId: string;
  addHighlightIntro: boolean; FFMPEG: string; ts: number; tmpDir: string; W: number; H: number;
  keyFontSize: number; keyFontColor: string; keyFontName: string; keyTextPosition: number;
  introStyle: string;
}): Promise<{ finalVideoFile: string; introAdded: boolean }> {
  if (!addHighlightIntro || !keyPhrase) return { finalVideoFile: mainVideoFile, introAdded: false };
  try {
    const introFile = path.join(tmpDir, `intro-${ts}.mp4`);
    const combinedFile = path.join(tmpDir, `combined-${ts}.mp4`);
    await buildHighlightIntro({ mainVideoFile, audioDuration, keyPhrase, introMusicId, FFMPEG, introFile, tmpDir, ts, W, H, keyFontSize, keyFontColor, keyFontName, keyTextPosition, introStyle });
    await concatenateVideos({ introFile, mainVideoFile, outputFile: combinedFile, FFMPEG });
    await fs.unlink(introFile).catch(() => {});
    return { finalVideoFile: combinedFile, introAdded: true };
  } catch (e) {
    console.error("[render] Intro failed:", e);
    return { finalVideoFile: mainVideoFile, introAdded: false };
  }
}

async function buildHighlightIntro({ mainVideoFile, audioDuration, keyPhrase, introMusicId, FFMPEG, introFile, tmpDir, ts, W, H, keyFontSize, keyFontColor, keyFontName, keyTextPosition, introStyle }: {
  mainVideoFile: string; audioDuration: number; keyPhrase: string;
  introMusicId: string; FFMPEG: string; introFile: string; tmpDir: string; ts: number; W: number; H: number;
  keyFontSize: number; keyFontColor: string; keyFontName: string; keyTextPosition: number;
  introStyle: string;
}): Promise<void> {
  const isVertical = H > W;
  const safeText = escapeDrawtext(keyPhrase);
  const introFwd = introFile.replace(/\\/g, "/");

  const fontAbsPath = path.join(process.cwd(), "public", "fonts", `${keyFontName}.ttf`);
  let fontFilePart = "";
  try { await fs.access(fontAbsPath); fontFilePart = `:fontfile='${fontAbsPath.replace(/\\/g, "/")}'`; } catch {}

  // Resolve music
  let useMusicFile = false;
  let musicFileFwd = "";
  let sfxTmpFile = "";
  if (introMusicId) {
    if (introMusicId.startsWith("http")) {
      try {
        const sfxRes = await fetch(introMusicId);
        sfxTmpFile = path.join(tmpDir, `sfx-${ts}.mp3`);
        await fs.writeFile(sfxTmpFile, Buffer.from(await sfxRes.arrayBuffer()));
        musicFileFwd = sfxTmpFile.replace(/\\/g, "/");
        useMusicFile = true;
      } catch { /* ignore */ }
    } else {
      const musicAbsPath = path.join(process.cwd(), "public", "music", `${introMusicId}.mp3`);
      try { await fs.access(musicAbsPath); musicFileFwd = musicAbsPath.replace(/\\/g, "/"); useMusicFile = true; } catch {}
    }
  }

  const audioArgs = useMusicFile
    ? { inputs: `-i "${musicFileFwd}"`, audioFilter: `[1:a]atrim=0:${INTRO_DURATION},asetpts=PTS-STARTPTS,afade=t=out:st=${INTRO_DURATION - 2}:d=2[a]`, mapA: "[a]" }
    : { inputs: `-f lavfi -i anullsrc=r=44100:cl=stereo`, audioFilter: `[1:a]atrim=0:${INTRO_DURATION}[a]`, mapA: "[a]" };

  // ── Title Card intro: pure text on dark background ──
  if (introStyle === "title_card") {
    const centerY = Math.floor(H / 2);
    const subY = centerY + Math.round(keyFontSize * 1.6);

    // Split long keyPhrase into two lines if needed
    const maxChars = isVertical ? 12 : 20;
    let line1 = keyPhrase;
    let line2 = "";
    if (keyPhrase.length > maxChars) {
      const mid = Math.ceil(keyPhrase.length / 2);
      let split = mid;
      for (let d = 1; d <= 6; d++) {
        if (keyPhrase[mid - d] === " ") { split = mid - d; break; }
        if (keyPhrase[mid + d] === " ") { split = mid + d + 1; break; }
      }
      line1 = keyPhrase.slice(0, split).trim();
      line2 = keyPhrase.slice(split).trim();
    }

    const textFilters = [
      `drawtext=text='${escapeDrawtext(line1)}'${fontFilePart}:fontsize=${keyFontSize}:fontcolor=${keyFontColor}:x=(w-tw)/2:y=${centerY - (line2 ? Math.round(keyFontSize * 0.7) : 0)}-(th/2):shadowx=4:shadowy=4:shadowcolor=black@0.9`,
      line2 ? `drawtext=text='${escapeDrawtext(line2)}'${fontFilePart}:fontsize=${keyFontSize}:fontcolor=${keyFontColor}:x=(w-tw)/2:y=${subY}-(th/2):shadowx=4:shadowy=4:shadowcolor=black@0.9` : "",
      `fade=t=in:st=0:d=0.8`,
      `fade=t=out:st=${INTRO_DURATION - 0.8}:d=0.8`,
    ].filter(Boolean).join(",");

    const cmd = useMusicFile
      ? `${FFMPEG} -f lavfi -i "color=c=0x080810:s=${W}x${H}:r=25" ${audioArgs.inputs} -filter_complex "[0:v]${textFilters}[v];${audioArgs.audioFilter}" -map "[v]" -map "${audioArgs.mapA}" -t ${INTRO_DURATION} -c:v libx264 -c:a aac -pix_fmt yuv420p "${introFwd}" -y`
      : `${FFMPEG} -f lavfi -i "color=c=0x080810:s=${W}x${H}:r=25" ${audioArgs.inputs} -filter_complex "[0:v]${textFilters}[v];${audioArgs.audioFilter}" -map "[v]" -map "${audioArgs.mapA}" -t ${INTRO_DURATION} -c:v libx264 -c:a aac -pix_fmt yuv420p "${introFwd}" -y`;
    await execAsync(cmd, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
    return;
  }

  // ── Cinematic intro (default): extract clip from main video + text overlay ──
  const startSec = Math.max(0, Math.min(audioDuration * 0.25, audioDuration - INTRO_DURATION - 1));
  const mainFwd = mainVideoFile.replace(/\\/g, "/");
  const centerY = Math.floor(H * keyTextPosition / 100);
  const nFrames = Math.ceil(INTRO_DURATION * 25);

  // Optional zoom-in on extracted clip
  const zoomFilter = introStyle === "zoom_in"
    ? `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},fps=25,zoompan=z='min(zoom+0.001,1.5)':d=${nFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H},setsar=1`
    : null;

  // Fit text into max 2 lines so it never overflows the frame width
  const { lines: introLines, fontSize: introFs } = fitTextLines(keyPhrase, W, keyFontSize);
  const introLineH = Math.round(introFs * 1.35);
  const introBoxH = introLines.length * introLineH + 20;
  const introBoxY = Math.max(0, centerY - Math.floor(introBoxH / 2) - 10);
  const introTextFilters = introLines.map((line, li) => {
    const lineY = centerY - Math.floor((introLines.length * introLineH) / 2) + li * introLineH;
    return `drawtext=text='${escapeDrawtext(line)}'${fontFilePart}:fontsize=${introFs}:fontcolor=${keyFontColor}:borderw=2:bordercolor=${keyFontColor}:x=(w-tw)/2:y=${lineY}:shadowx=3:shadowy=3:shadowcolor=black@0.9`;
  });

  const vf = isVertical ? [
    zoomFilter ?? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`,
    `eq=contrast=1.15:saturation=0.65:brightness=-0.04`,
    `drawbox=x=0:y=${introBoxY}:w=${W}:h=${introBoxH}:color=black@0.65:t=fill`,
    ...introTextFilters,
    `fade=t=in:st=0:d=0.7`,
    `fade=t=out:st=${INTRO_DURATION - 0.7}:d=0.7`,
  ].join(",") : [
    zoomFilter ?? `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1`,
    `eq=contrast=1.15:saturation=0.65:brightness=-0.04`,
    `crop=1280:544:0:88,pad=1280:720:0:88:color=black`,
    `drawbox=x=0:y=${Math.max(88, introBoxY)}:w=1280:h=${introBoxH}:color=black@0.65:t=fill`,
    ...introTextFilters,
    `fade=t=in:st=0:d=0.7`,
    `fade=t=out:st=${INTRO_DURATION - 0.7}:d=0.7`,
  ].join(",");

  const cmd = useMusicFile
    ? `${FFMPEG} -ss ${startSec.toFixed(3)} -t ${INTRO_DURATION} -i "${mainFwd}" ${audioArgs.inputs} -filter_complex "[0:v]${vf}[v];${audioArgs.audioFilter}" -map "[v]" -map "${audioArgs.mapA}" -c:v libx264 -c:a aac -pix_fmt yuv420p "${introFwd}" -y`
    : `${FFMPEG} -ss ${startSec.toFixed(3)} -t ${INTRO_DURATION} -i "${mainFwd}" ${audioArgs.inputs} -filter_complex "[0:v]${vf}[v];${audioArgs.audioFilter}" -map "[v]" -map "${audioArgs.mapA}" -c:v libx264 -c:a aac -pix_fmt yuv420p -t ${INTRO_DURATION} "${introFwd}" -y`;

  await execAsync(cmd, { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
  if (sfxTmpFile) await fs.unlink(sfxTmpFile).catch(() => {});
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
