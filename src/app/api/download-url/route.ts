import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { url, filename } = await req.json();
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

    // Extract storage path from public URL
    // Format: https://[project].supabase.co/storage/v1/object/public/media/[path]
    const urlObj = new URL(url);
    const prefix = "/storage/v1/object/public/media/";
    if (!urlObj.pathname.startsWith(prefix)) {
      // Not a Supabase storage URL — return as-is
      return NextResponse.json({ signedUrl: url });
    }
    const filePath = urlObj.pathname.slice(prefix.length);

    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from("media")
      .createSignedUrl(filePath, 300, { download: filename ?? "video.mp4" });

    if (error || !data?.signedUrl) throw error ?? new Error("signed url failed");

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error("Download URL error:", err);
    return NextResponse.json({ error: "서명 URL 생성 실패" }, { status: 500 });
  }
}
