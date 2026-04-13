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
      .map((v: any) => {
        // Find a Korean sample URL (prefer sona_speech_2, fallback to any ko sample)
        const samples: any[] = v.samples ?? [];
        const koSample =
          samples.find((s) => s.language === "ko" && s.model === "sona_speech_2") ??
          samples.find((s) => s.language === "ko") ??
          null;
        return {
          voice_id: v.voice_id,
          name: v.name,
          description: v.description ?? "",
          age: v.age ?? "",
          gender: v.gender ?? "",
          use_case: v.use_case ?? "",
          styles: v.styles ?? ["neutral"],
          thumbnail_image_url: v.thumbnail_image_url ?? "",
          preview_url: koSample?.url ?? "",
        };
      });
    return NextResponse.json({ voices });
  } catch (e) {
    console.error("[supertone voices] error:", e);
    return NextResponse.json({ voices: [] });
  }
}
