import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.SUPERTONE_API_KEY;
  if (!apiKey) return NextResponse.json({ voices: [], error: "SUPERTONE_API_KEY not set" });

  try {
    const res = await fetch("https://supertoneapi.com/v1/voices?limit=50", {
      headers: { "x-sup-api-key": apiKey },
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[supertone voices]", res.status, err);
      return NextResponse.json({ voices: [] });
    }
    const data = await res.json();
    // Filter voices that support Korean
    const voices = (data.items ?? [])
      .filter((v: any) => (v.language ?? []).includes("ko"))
      .map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        gender: v.gender ?? "",
        styles: v.styles ?? ["neutral"],
      }));
    return NextResponse.json({ voices });
  } catch (e) {
    console.error("[supertone voices] error:", e);
    return NextResponse.json({ voices: [] });
  }
}
