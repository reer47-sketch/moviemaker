import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DURATION_OPTIONS } from "@/lib/introMusic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { topic, duration = "short", characterDescription = "", language = "ko" } = await req.json();
    const isEn = language === "en";

    if (!topic?.trim()) {
      return NextResponse.json({ error: "주제를 입력해주세요" }, { status: 400 });
    }

    const dur = DURATION_OPTIONS.find((d) => d.id === duration) ?? DURATION_OPTIONS[0];
    const isShort = duration === "short";

    const promptText = isEn
      ? `Write a YouTube video script about: "${topic}"

Requirements:
- ${dur.minScenes}–${dur.maxScenes} scenes total
- Full script ~${dur.targetWords} words (${dur.label})
- Each scene has a clear focus
- Write in English
- Engaging, compelling content
- keyPhrase: powerful hook phrase for thumbnail or intro (max 10 words)
- imagePrompt: English DALL-E 3 prompt, cinematic and photorealistic, single line${characterDescription ? `\n- Include this character in every imagePrompt: "${characterDescription}"` : ""}`
      : `다음 주제로 유튜브 영상 스크립트를 작성해주세요: "${topic}"

요구사항:
- 총 ${dur.minScenes}~${dur.maxScenes}개 장면으로 구성
- 전체 스크립트는 약 ${dur.targetWords}자 (${dur.label} 분량)
- 각 장면은 명확한 주제를 가짐
- 한국어로 작성
- 흥미롭고 시청자를 사로잡는 내용
- keyPhrase: 영상 썸네일이나 인트로에 쓸 수 있는 가장 강렬한 핵심 문구 (15자 이내)
- imagePrompt: 각 장면을 시각적으로 표현하는 영어 DALL-E 3 프롬프트, 한 줄로 작성${characterDescription ? `\n- 모든 imagePrompt에 반드시 이 캐릭터를 포함할 것: "${characterDescription}"` : ""}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: isShort ? 1500 : duration === "10min" ? 6000 : 3500,
      tools: [
        {
          name: "create_video_script",
          description: "Create a structured YouTube video script",
          input_schema: {
            type: "object" as const,
            properties: {
              keyPhrase: {
                type: "string",
                description: isEn
                  ? "Most impactful phrase from the video (max 10 words)"
                  : "영상에서 가장 임팩트 있는 핵심 문구 (15자 이내)",
              },
              script: {
                type: "string",
                description: isEn
                  ? "Full narration script as natural flowing text"
                  : "전체 스크립트 텍스트 (자연스럽게 이어지는 나레이션)",
              },
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    content: { type: "string" },
                    imagePrompt: {
                      type: "string",
                      description: "DALL-E 3 image prompt in English, single line, photorealistic cinematic",
                    },
                  },
                  required: ["title", "content", "imagePrompt"],
                },
              },
            },
            required: ["keyPhrase", "script", "scenes"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "create_video_script" },
      messages: [{ role: "user", content: promptText }],
    });

    const toolUse = message.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("No tool_use response from Claude");
    }

    const result = toolUse.input as {
      keyPhrase: string;
      script: string;
      scenes: { title: string; content: string; imagePrompt?: string }[];
    };

    return NextResponse.json({
      keyPhrase: result.keyPhrase ?? "",
      script: result.script,
      scenes: result.scenes.map((s) => ({
        title: s.title,
        content: s.content,
        imagePrompt: s.imagePrompt ?? "",
      })),
    });
  } catch (error) {
    console.error("Script generation error:", error);
    return NextResponse.json(
      { error: "스크립트 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
