import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { deductCredits, voiceCreditCost } from "@/lib/credits";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const maxDuration = 300;

/** Split text into ≤maxChars chunks at sentence boundaries */
function splitTextChunks(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?。])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current ? current + " " + sentence : sentence).length <= maxChars) {
      current = current ? current + " " + sentence : sentence;
    } else {
      if (current) chunks.push(current);
      if (sentence.length > maxChars) {
        for (let i = 0; i < sentence.length; i += maxChars) {
          chunks.push(sentence.slice(i, i + maxChars));
        }
        current = "";
      } else {
        current = sentence;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.trim().length > 0);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      script, duration = "short",
      supertoneVoiceId = "", supertoneStyle = "neutral",
      language = "ko",
    } = body;

    if (!script) {
      return NextResponse.json({ error: "스크립트를 입력해주세요" }, { status: 400 });
    }
    if (!supertoneVoiceId) {
      return NextResponse.json({ error: "목소리를 선택해주세요" }, { status: 400 });
    }

    const cost = voiceCreditCost(duration);
    const creditResult = await deductCredits(req, cost);
    if (creditResult instanceof NextResponse) return creditResult;

    const apiKey = process.env.SUPERTONE_API_KEY;
    if (!apiKey) throw new Error("SUPERTONE_API_KEY is not set");

    const chunks = splitTextChunks(script, 280);
    const tmpDir = os.tmpdir();
    const ts = Date.now();
    const chunkFiles: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const res = await fetch(
        `https://supertoneapi.com/v1/text-to-speech/${supertoneVoiceId}`,
        {
          method: "POST",
          headers: { "x-sup-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: chunks[i],
            language: language === "en" ? "en" : "ko",
            model: "sona_speech_2",
            style: supertoneStyle,
            output_format: "mp3",
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supertone API error: ${res.status} ${err}`);
      }
      const chunkFile = path.join(tmpDir, `suptone-${ts}-${i}.mp3`);
      await fs.writeFile(chunkFile, Buffer.from(await res.arrayBuffer()));
      chunkFiles.push(chunkFile);
    }

    let finalBuffer: Buffer;
    if (chunkFiles.length === 1) {
      finalBuffer = await fs.readFile(chunkFiles[0]);
    } else {
      const ffmpegRaw = (await import("ffmpeg-static")).default ?? "";
      const FFMPEG = `"${ffmpegRaw.replace(/^\/ROOT\//, "/var/task/")}"`;

      const listFile = path.join(tmpDir, `list-${ts}.txt`).replace(/\\/g, "/");
      const finalFile = path.join(tmpDir, `suptone-${ts}-final.mp3`).replace(/\\/g, "/");
      await fs.writeFile(listFile, chunkFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
      await execAsync(
        `${FFMPEG} -f concat -safe 0 -i "${listFile}" -c copy "${finalFile}" -y`,
        { timeout: 120000, maxBuffer: 50 * 1024 * 1024 }
      );
      finalBuffer = await fs.readFile(finalFile);
      await fs.unlink(listFile).catch(() => {});
      await fs.unlink(finalFile).catch(() => {});
    }
    await Promise.all(chunkFiles.map((f) => fs.unlink(f).catch(() => {})));

    const supabase = createServiceClient();
    const fileName = `audio/supertone-${ts}.mp3`;
    const { error } = await supabase.storage.from("media").upload(fileName, finalBuffer, { contentType: "audio/mpeg" });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);
    return NextResponse.json({ audioUrl: urlData.publicUrl });

  } catch (error) {
    console.error("Voice generation error:", error);
    return NextResponse.json({ error: "음성 생성 중 오류가 발생했습니다" }, { status: 500 });
  }
}
