import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 300;

const XAI_KEY = process.env.XAI_API_KEY ?? "";
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 50; // 50 × 5s = 250s max

export async function POST(req: NextRequest) {
  if (!XAI_KEY) {
    return NextResponse.json({ error: "XAI_API_KEY가 설정되지 않았습니다" }, { status: 500 });
  }

  try {
    const { scenes, count } = await req.json() as {
      scenes: { title: string; content: string; imagePrompt?: string }[];
      count?: number;
    };

    if (!scenes?.length) {
      return NextResponse.json({ error: "장면 정보가 필요합니다" }, { status: 400 });
    }

    // Limit to requested count (default: all scenes)
    const targetScenes = count ? scenes.slice(0, count) : scenes;
    const supabase = createServiceClient();

    // Submit requests sequentially (rate limit: 1 req/sec)
    const requestIds: string[] = [];
    for (const scene of targetScenes) {
      const prompt = scene.imagePrompt?.trim()
        ? scene.imagePrompt
        : `${scene.title}: ${scene.content.slice(0, 120)}. Cinematic, photorealistic, smooth motion.`;

      const res = await fetch("https://api.x.ai/v1/videos/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${XAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "grok-imagine-video", prompt, n: 1 }),
      });
      if (!res.ok) throw new Error(`xAI video create error: ${res.status} ${await res.text()}`);
      const { request_id } = await res.json() as { request_id: string };
      requestIds.push(request_id);

      // Respect 1 req/sec rate limit
      await new Promise((r) => setTimeout(r, 1200));
    }

    // Poll all requests in parallel until done
    const xaiUrls = await Promise.all(
      requestIds.map(async (request_id) => {
        for (let i = 0; i < MAX_POLLS; i++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const poll = await fetch(`https://api.x.ai/v1/videos/${request_id}`, {
            headers: { Authorization: `Bearer ${XAI_KEY}` },
          });
          if (!poll.ok) throw new Error(`xAI video poll error: ${poll.status}`);
          const data = await poll.json() as { status: string; video?: { url: string } };
          if (data.status === "done" && data.video?.url) return data.video.url;
        }
        throw new Error("xAI video generation timed out");
      })
    );

    // Upload all clips to Supabase
    const clipUrls = await Promise.all(
      xaiUrls.map(async (xaiUrl, i) => {
        const videoRes = await fetch(xaiUrl);
        if (!videoRes.ok) throw new Error(`클립 다운로드 실패: ${videoRes.status}`);
        const buf = await videoRes.arrayBuffer();

        const fileName = `videos/clip-${Date.now()}-${i}.mp4`;
        const { error } = await supabase.storage
          .from("media")
          .upload(fileName, buf, { contentType: "video/mp4" });
        if (error) throw error;

        const { data } = supabase.storage.from("media").getPublicUrl(fileName);
        return data.publicUrl;
      })
    );

    return NextResponse.json({ clipUrls });
  } catch (error) {
    console.error("Video clip generation error:", error);
    return NextResponse.json(
      { error: "영상 클립 생성 중 오류가 발생했습니다", detail: String(error) },
      { status: 500 }
    );
  }
}
