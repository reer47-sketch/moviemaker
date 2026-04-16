import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { script, title, characterDescription = "", moods = [] } = await req.json();

    if (!script?.trim() || !title?.trim()) {
      return NextResponse.json({ error: "script, title 필수" }, { status: 400 });
    }

    const moodText = (moods as string[]).length > 0 ? (moods as string[]).join(", ") : "";

    // Claude로 기존 스크립트를 장면별로 분할 + imagePrompt 생성
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      tools: [
        {
          name: "parse_recipe_script",
          description: "Parse a pre-written recipe YouTube script into structured scenes with image prompts",
          input_schema: {
            type: "object" as const,
            properties: {
              keyPhrase: {
                type: "string",
                description: "핵심 문구 — 썸네일이나 인트로에 쓸 가장 임팩트 있는 15자 이내 문구",
              },
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "장면 제목 (예: 오프닝, 재료 소개, 조리 과정 등)" },
                    content: { type: "string", description: "해당 장면의 나레이션 텍스트" },
                    imagePrompt: {
                      type: "string",
                      description: "DALL-E 3 이미지 프롬프트 (영어, 한 줄, photorealistic, cinematic food photography)",
                    },
                  },
                  required: ["title", "content", "imagePrompt"],
                },
              },
            },
            required: ["keyPhrase", "scenes"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "parse_recipe_script" },
      messages: [
        {
          role: "user",
          content: `다음은 "${title}" 요리 유튜브 스크립트입니다. 이미 완성된 스크립트를 그대로 장면별로 나눠주세요. 내용을 바꾸거나 새로 쓰지 말고, 원본 텍스트를 그대로 각 장면에 배분하세요.${moodText ? `\n무드/톤: ${moodText}` : ""}${characterDescription ? `\n모든 imagePrompt에 이 캐릭터 포함: ${characterDescription}` : ""}

스크립트:
${script}`,
        },
      ],
    });

    const toolUse = message.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Claude tool_use 응답 없음");
    }

    const result = toolUse.input as {
      keyPhrase: string;
      scenes: { title: string; content: string; imagePrompt: string }[];
    };

    // Supabase에 임시 저장 (24시간 후 만료)
    const supabase = createServiceClient();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("shared_drafts")
      .insert({
        title,
        script,
        scenes: result.scenes,
        key_phrase: result.keyPhrase,
        character_description: characterDescription,
        moods,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error) throw error;

    const url = `https://moviemaker-phi.vercel.app/create?draft=${data.id}`;
    return NextResponse.json({ draftId: data.id, url });
  } catch (error) {
    console.error("from-recipe draft error:", error);
    return NextResponse.json({ error: "드래프트 생성에 실패했습니다" }, { status: 500 });
  }
}
