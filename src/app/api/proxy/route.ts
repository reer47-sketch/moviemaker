import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const res = await fetch(url);
  if (!res.ok) return NextResponse.json({ error: "fetch failed" }, { status: 502 });

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600",
  };

  const filename = req.nextUrl.searchParams.get("filename");
  if (filename) {
    // RFC 5987 encoding — works on iOS Safari, Android, all modern browsers
    const encoded = encodeURIComponent(filename);
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encoded}`;
  }

  // Stream the response body directly (no buffering)
  return new NextResponse(res.body, { headers });
}
