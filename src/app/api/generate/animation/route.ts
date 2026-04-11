import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 60;

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

// POST /api/generate/animation
// body: { scenes } → returns { predictionIds: string[] }
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

    // Create predictions in parallel — return IDs immediately without waiting
    const predictions = await Promise.all(
      (scenes as Scene[]).map((scene) =>
        replicate.predictions.create({
          model: "minimax/video-01",
          input: {
            prompt: buildPrompt(scene),
            duration: 6,
            ratio: "16:9",
          },
        })
      )
    );

    const predictionIds = predictions.map((p) => p.id);
    console.log("[animation] Created predictions:", predictionIds);
    return NextResponse.json({ predictionIds });
  } catch (error) {
    console.error("Animation prediction creation error:", error);
    return NextResponse.json(
      { error: "애니메이션 생성 요청 중 오류가 발생했습니다", detail: String(error) },
      { status: 500 }
    );
  }
}

// GET /api/generate/animation?ids=id1,id2,...
// Checks status of all predictions; if all done, uploads and returns URLs
export async function GET(req: NextRequest) {
  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: "REPLICATE_API_TOKEN이 설정되지 않았습니다" }, { status: 500 });
  }

  const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  if (!ids.length) {
    return NextResponse.json({ error: "ids가 필요합니다" }, { status: 400 });
  }

  try {
    const predictions = await Promise.all(ids.map((id) => replicate.predictions.get(id)));

    const statuses = predictions.map((p) => p.status);
    const allDone = statuses.every((s) => s === "succeeded" || s === "failed");
    const anyFailed = statuses.some((s) => s === "failed");

    if (!allDone) {
      return NextResponse.json({ status: "processing", statuses });
    }

    if (anyFailed) {
      return NextResponse.json({ error: "일부 애니메이션 생성에 실패했습니다" }, { status: 500 });
    }

    // All succeeded — upload to Supabase
    const supabase = createServiceClient();
    const animationUrls = await Promise.all(
      predictions.map(async (p) => {
        const raw = p.output as unknown;
        const url = Array.isArray(raw) ? String(raw[0]) : String(raw);

        const videoRes = await fetch(url);
        if (!videoRes.ok) throw new Error(`Failed to download clip: ${videoRes.status}`);
        const videoBuffer = await videoRes.arrayBuffer();

        const fileName = `animations/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
        const { error } = await supabase.storage
          .from("media")
          .upload(fileName, videoBuffer, { contentType: "video/mp4" });
        if (error) throw error;

        const { data } = supabase.storage.from("media").getPublicUrl(fileName);
        return data.publicUrl;
      })
    );

    return NextResponse.json({ status: "succeeded", animationUrls });
  } catch (error) {
    console.error("Animation poll error:", error);
    return NextResponse.json(
      { error: "상태 확인 중 오류가 발생했습니다", detail: String(error) },
      { status: 500 }
    );
  }
}
