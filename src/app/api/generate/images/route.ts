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
const IMAGE_SIZE = "1792x1024";

type Scene = { title: string; content: string; imagePrompt?: string };

async function generateAndUploadImage(scene: Scene): Promise<string> {
  const supabase = createServiceClient();

  const prompt = scene.imagePrompt?.trim()
    ? scene.imagePrompt
    : `A real photograph for a YouTube video scene.
Scene: "${scene.title}" — ${scene.content}

Requirements:
- Photorealistic, looks like an actual photo taken by a photographer
- Real people, real places, real objects (no CGI, no illustrations, no artwork)
- Natural lighting, documentary or editorial photography style
- No text, no captions, no watermarks
- 16:9 widescreen composition`;

  const generateParams = useXai
    ? { model: IMAGE_MODEL, prompt, n: 1 }
    : { model: IMAGE_MODEL, prompt, n: 1, size: IMAGE_SIZE as "1792x1024", quality: "standard" as const };
  const response = await imageClient.images.generate(generateParams);

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) throw new Error("No image URL returned from DALL-E");

  // Download and re-upload to Supabase for permanent storage
  const imgRes = await fetch(imageUrl);
  const imgBuffer = await imgRes.arrayBuffer();
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
    const { scenes } = await req.json();

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: "장면 정보가 필요합니다" }, { status: 400 });
    }

    const cost = CREDIT_COSTS.image * scenes.length;
    const creditResult = await deductCredits(req, cost);
    if (creditResult instanceof NextResponse) return creditResult;

    // Generate images in parallel (max 3 at a time to avoid rate limits)
    const imageUrls: string[] = [];
    const batchSize = 3;

    for (let i = 0; i < scenes.length; i += batchSize) {
      const batch = scenes.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(generateAndUploadImage));
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
