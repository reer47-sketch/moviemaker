import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// ElevenLabs voice IDs
const VOICE_MAP: Record<string, string> = {
  rachel:  "21m00Tcm4TlvDq8ikWAM", // 자연스럽고 따뜻한 여성
  adam:    "pNInz6obpgDQGcFmaJgB", // 차분하고 신뢰감 있는 남성
  bella:   "EXAVITQu4vr4xnSDxMaL", // 밝고 활기찬 여성
  antoni:  "ErXwobaYiN019PkySvjV", // 젊고 에너지 넘치는 남성
};

export async function POST(req: NextRequest) {
  try {
    const { script, voiceId } = await req.json();

    if (!script || !voiceId) {
      return NextResponse.json({ error: "스크립트와 목소리를 선택해주세요" }, { status: 400 });
    }

    const elevenLabsVoiceId = VOICE_MAP[voiceId] ?? VOICE_MAP.rachel;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: script,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("ElevenLabs error:", res.status, err);
      throw new Error(`ElevenLabs API error: ${res.status}`);
    }

    const audioBuffer = await res.arrayBuffer();

    // Upload to Supabase Storage
    const supabase = createServiceClient();
    const fileName = `audio/${Date.now()}.mp3`;

    const { error } = await supabase.storage
      .from("media")
      .upload(fileName, audioBuffer, { contentType: "audio/mpeg" });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);

    return NextResponse.json({ audioUrl: urlData.publicUrl });
  } catch (error) {
    console.error("Voice generation error:", error);
    return NextResponse.json(
      { error: "음성 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
