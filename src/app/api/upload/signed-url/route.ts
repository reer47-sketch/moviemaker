import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { fileName, contentType } = await req.json();
    const supabase = createServiceClient();

    const ext = (fileName as string).split(".").pop() ?? "bin";
    const folder = (contentType as string).startsWith("video/") ? "videos" : "images";
    const storagePath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage
      .from("media")
      .createSignedUploadUrl(storagePath);

    if (error) throw error;

    const { data: publicData } = supabase.storage.from("media").getPublicUrl(storagePath);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      publicUrl: publicData.publicUrl,
    });
  } catch (error) {
    console.error("Signed URL error:", error);
    return NextResponse.json({ error: "서명된 URL 생성 실패" }, { status: 500 });
  }
}
