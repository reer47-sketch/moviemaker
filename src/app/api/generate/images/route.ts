import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

export const maxDuration = 300;

// Use xAI Aurora if XAI_API_KEY is set, otherwise fall back to DALL-E 3
const useXai = !!process.env.XAI_API_KEY;
const imageClient = useXai
  ? new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" })
  : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const IMAGE_MODEL = useXai ? "grok-imagine-image" : "dall-e-3";

type Scene = { title: string; content: string; imagePrompt?: string };

async function generateAndUploadImage(scene: Scene, isShorts: boolean): Promise<string> {
  const supabase = createServiceClient();

  const size = isShorts ? "1024x1792" : "1792x1024";

  const basePrompt = scene.imagePrompt?.trim() || `A real photograph for a YouTube video scene.
Scene: "${scene.title}" — ${scene.content}

Requirements:
- Photorealistic, looks like an actual photo taken by a photographer
- Real people, real places, real objects (no CGI, no illustrations, no artwork)
- Natural lighting, documentary or editorial photography style
- No text, no captions, no watermarks`;

  const prompt = isShorts
    ? `VERTICAL PORTRAIT FORMAT (9:16 tall). ${basePrompt}\n- Tall vertical composition filling the full portrait frame`
    : `${basePrompt}\n- 16:9 widescreen horizontal composition`;

  // xAI does NOT support size parameter — portrait is prompt-only for xAI
  // DALL-E 3 supports 1024x1792 for portrait
  const generateParams = useXai
    ? { model: IMAGE_MODEL, prompt, n: 1 }
    : { model: IMAGE_MODEL, prompt, n: 1, size: size as "1024x1792" | "1792x1024", quality: "standard" as const };
  const response = await imageClient.images.generate(generateParams);

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) throw new Error("No image URL returned from image API");

  // Download image
  const imgRes = await fetch(imageUrl);
  let imgBuffer: ArrayBuffer | Buffer = await imgRes.arrayBuffer();

  // xAI always returns landscape — crop to 9:16 portrait for Shorts
  if (isShorts && useXai) {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(Buffer.from(imgBuffer)).metadata();
    const origW = meta.width ?? 1024;
    const origH = meta.height ?? 1024;
    // Center-crop to 9:16 from the landscape image
    const cropW = Math.floor(origH * 9 / 16);
    const cropH = origH;
    const left  = Math.floor((origW - cropW) / 2);
    imgBuffer = await sharp(Buffer.from(imgBuffer))
      .extract({ left, top: 0, width: cropW, height: cropH })
      .resize(720, 1280, { fit: "cover" })
      .png()
      .toBuffer();
  }

  const fileName = `images/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

  const { error } = await supabase.storage
    .from("media")
    .upload(fileName, imgBuffer, { contentType: "image/png" });

  if (error) throw error;

  const { data } = supabase.storage.from("media").getPublicUrl(fileName);
  return data.publicUrl;
}

export async function POST(req: NextRequest) {
  try {
    const { scenes, duration } = await req.json();
    const isShorts = duration === "short";

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: "장면 정보가 필요합니다" }, { status: 400 });
    }

    const cost = CREDIT_COSTS.image * scenes.length;
    const creditResult = await deductCredits(req, cost);
    if (creditResult instanceof NextResponse) return creditResult;

    const imageUrls: string[] = [];
    const batchSize = 3;

    for (let i = 0; i < scenes.length; i += batchSize) {
      const batch = scenes.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((s: Scene) => generateAndUploadImage(s, isShorts)));
      imageUrls.push(...batchResults);
    }

    return NextResponse.json({ imageUrls });
  } catch (error) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: "이미지 생성 중 오류가 발생했습니다", detail: String(error) },
      { status: 500 }
    );
  }
}
