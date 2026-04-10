import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const type = (formData.get("type") as string) ?? "images";

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const ext = file.name.split(".").pop() ?? "bin";
    const fileName = `${type}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();

    const { error } = await supabase.storage
      .from("media")
      .upload(fileName, arrayBuffer, { contentType: file.type });

    if (error) throw error;

    const { data } = supabase.storage.from("media").getPublicUrl(fileName);

    return NextResponse.json({ url: data.publicUrl, name: file.name, type: file.type });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "업로드 중 오류가 발생했습니다" }, { status: 500 });
  }
}
