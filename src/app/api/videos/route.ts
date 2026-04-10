import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServiceClient();

    const { data, error } = await (supabase as any)
      .from("videos")
      .insert({
        topic: body.topic,
        script: body.script,
        scenes: body.scenes,
        audio_url: body.audioUrl,
        image_urls: body.imageUrls,
        video_url: body.videoUrl,
        subtitled_video_url: body.subtitledVideoUrl,
        status: "completed",
        user_id: null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error("Save video error:", error);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await (supabase as any)
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ videos: data });
  } catch (error) {
    console.error("Fetch videos error:", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const supabase = createServiceClient();
    const { error } = await (supabase as any).from("videos").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete video error:", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
