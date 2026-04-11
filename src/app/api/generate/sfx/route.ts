import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { topic, keyPhrase } = await req.json();
    if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

    // Step 1: Claude generates 3 sound effect prompts
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      messages: [{
        role: "user",
        content: `YouTube video topic: "${topic}" / key phrase: "${keyPhrase}"
Generate 3 sound effect descriptions for a 5-second intro clip, each a different mood.
Return JSON array only (no other text):
[
  {"label":"임팩트 (한국어)", "prompt":"impactful sound, 10-15 English words"},
  {"label":"분위기 (한국어)", "prompt":"atmospheric sound, 10-15 English words"},
  {"label":"경쾌함 (한국어)", "prompt":"upbeat sound, 10-15 English words"}
]`,
      }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text;
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Failed to parse SFX prompts");
    const prompts: { label: string; prompt: string }[] = JSON.parse(match[0]);

    // Step 2: Generate each SFX with ElevenLabs in parallel
    const supabase = createServiceClient();
    const ts = Date.now();

    const results = await Promise.all(
      prompts.map(async (item, i) => {
        const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: item.prompt,
            duration_seconds: 6,
            prompt_influence: 0.3,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          console.error(`[sfx] ElevenLabs error ${i}:`, res.status, err);
          return null;
        }

        const buf = await res.arrayBuffer();
        const fileName = `sfx/${ts}-${i}.mp3`;
        const { error } = await supabase.storage
          .from("media")
          .upload(fileName, buf, { contentType: "audio/mpeg" });
        if (error) throw error;

        const { data } = supabase.storage.from("media").getPublicUrl(fileName);
        return { label: item.label, prompt: item.prompt, url: data.publicUrl };
      })
    );

    const sfxOptions = results.filter(Boolean);
    return NextResponse.json({ sfxOptions });
  } catch (error) {
    console.error("SFX generation error:", error);
    return NextResponse.json({ error: "효과음 생성 중 오류가 발생했습니다" }, { status: 500 });
  }
}
