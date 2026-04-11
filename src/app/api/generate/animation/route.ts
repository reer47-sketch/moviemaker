import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 300;

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

type Scene = { title: string; content: string };

function buildPrompt(scene: Scene): string {
  return (
    `simple stick figure character on plain white background, ` +
    `${scene.title}: ${scene.content.slice(0, 120)}, ` +
    `2D line drawing animation style, stickman performing action, ` +
    `smooth motion, minimal cartoon, no background detail, no text`
  );
}

async function generateClip(scene: Scene): Promise<string> {
  const output = await replicate.run(
    "wavespeedai/wan-2.1-t2v-480p" as `${string}/${string}`,
    {
      input: {
        prompt: buildPrompt(scene),
        negative_prompt:
          "realistic photo, complex background, 3D render, watermark, text, ugly, blurry",
        num_frames: 24,
        fps: 8,
        width: 480,
        height: 272,
      },
    }
  );

  // output is a URL string or array
  const raw = output as unknown;
  const url = Array.isArray(raw) ? String(raw[0]) : String(raw);
  if (!url) throw new Error("No output from Replicate");

  // Download clip and re-upload to Supabase for permanent storage
  const videoRes = await fetch(url);
  if (!videoRes.ok) throw new Error(`Failed to download clip: ${videoRes.status}`);
  const videoBuffer = await videoRes.arrayBuffer();

  const supabase = createServiceClient();
  const fileName = `animations/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;

  const { error } = await supabase.storage
    .from("media")
    .upload(fileName, videoBuffer, { contentType: "video/mp4" });
  if (error) throw error;

  const { data } = supabase.storage.from("media").getPublicUrl(fileName);
  return data.publicUrl;
}

export async function POST(req: NextRequest) {
  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "REPLICATE_API_TOKEN이 설정되지 않았습니다" },
      { status: 500 }
    );
  }

  try {
    const { scenes } = await req.json();
    if (!scenes?.length) {
      return NextResponse.json({ error: "장면 정보가 필요합니다" }, { status: 400 });
    }

    // Generate clips sequentially (Replicate rate limit)
    const animationUrls: string[] = [];
    for (const scene of scenes as Scene[]) {
      console.log("[animation] Generating clip for scene:", scene.title);
      const url = await generateClip(scene);
      animationUrls.push(url);
      console.log("[animation] Clip done:", url);
    }

    return NextResponse.json({ animationUrls });
  } catch (error) {
    console.error("Animation generation error:", error);
    return NextResponse.json(
      { error: "애니메이션 생성 중 오류가 발생했습니다", detail: String(error) },
      { status: 500 }
    );
  }
}
