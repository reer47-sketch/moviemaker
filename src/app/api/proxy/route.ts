import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const res = await fetch(url);
  if (!res.ok) return NextResponse.json({ error: "fetch failed" }, { status: 502 });

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  const download = req.nextUrl.searchParams.get("download");
  if (download) {
    const filename = req.nextUrl.searchParams.get("filename") ?? "video.mp4";
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(buffer, { headers });
}
