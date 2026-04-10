import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// OpenAI TTS voice mapping
const VOICE_MAP: Record<string, "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = {
  rachel: "nova",    // 자연스럽고 따뜻한 여성
  adam: "onyx",     // 차분하고 신뢰감 있는 남성
  bella: "shimmer", // 밝고 활기찬 여성
  josh: "echo",     // 젊고 에너지 넘치는 남성
};

export async function POST(req: NextRequest) {
  try {
    const { script, voiceId } = await req.json();

    if (!script || !voiceId) {
      return NextResponse.json({ error: "스크립트와 목소리를 선택해주세요" }, { status: 400 });
    }

    const voice = VOICE_MAP[voiceId] ?? "nova";

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: script,
      response_format: "mp3",
    });

    const audioBuffer = await mp3.arrayBuffer();

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
