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

// ElevenLabs voice IDs
const VOICE_MAP: Record<string, string> = {
  brian:   "nPczCjzI2devNBz1zQrb",
  george:  "JBFqnCBsd6RMkjVDRZzb",
  eric:    "cjVigY5qzO86Huf0OWal",
  sarah:   "EXAVITQu4vr4xnSDxMaL",
  jessica: "cgSgspJ2msm6clMCkdW9",
  matilda: "XrExE9yKIg1WjnnlVkGX",
};

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
        // Force-split overly long sentences
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
      script, voiceId, duration = "short",
      useSupertone = false, supertoneVoiceId = "", supertoneStyle = "neutral",
    } = body;

    if (!script) {
      return NextResponse.json({ error: "스크립트를 입력해주세요" }, { status: 400 });
    }

    const cost = voiceCreditCost(duration);
    const creditResult = await deductCredits(req, cost);
    if (creditResult instanceof NextResponse) return creditResult;

    // ── Supertone TTS ──────────────────────────────────────────
    if (useSupertone && supertoneVoiceId) {
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
              language: "ko",
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
        const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
        const FFMPEG = `"${ffmpegInstaller.path}"`;
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
    }

    // ── ElevenLabs TTS ─────────────────────────────────────────
    if (!voiceId) {
      return NextResponse.json({ error: "목소리를 선택해주세요" }, { status: 400 });
    }

    const elevenLabsVoiceId = VOICE_MAP[voiceId] ?? VOICE_MAP.brian;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: script,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("ElevenLabs error:", res.status, err);
      throw new Error(`ElevenLabs API error: ${res.status}`);
    }

    const audioBuffer = await res.arrayBuffer();
    const supabase = createServiceClient();
    const fileName = `audio/${Date.now()}.mp3`;
    const { error } = await supabase.storage.from("media").upload(fileName, audioBuffer, { contentType: "audio/mpeg" });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);
    return NextResponse.json({ audioUrl: urlData.publicUrl });

  } catch (error) {
    console.error("Voice generation error:", error);
    return NextResponse.json({ error: "음성 생성 중 오류가 발생했습니다" }, { status: 500 });
  }
}
