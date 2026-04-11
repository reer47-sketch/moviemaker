import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DURATION_OPTIONS } from "@/lib/introMusic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { topic, duration = "short", characterDescription = "" } = await req.json();

    if (!topic?.trim()) {
      return NextResponse.json({ error: "주제를 입력해주세요" }, { status: 400 });
    }

    const dur = DURATION_OPTIONS.find((d) => d.id === duration) ?? DURATION_OPTIONS[0];
    const isShort = duration === "short";

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: isShort ? 1000 : duration === "10min" ? 5000 : 3000,
      messages: [
        {
          role: "user",
          content: `다음 주제로 유튜브 영상 스크립트를 작성해주세요: "${topic}"

반드시 아래 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{
  "keyPhrase": "영상에서 가장 임팩트 있는 핵심 문구 (15자 이내, 시청자 시선을 끄는 한 문장)",
  "script": "전체 스크립트 텍스트 (자연스럽게 이어지는 나레이션)",
  "scenes": [
    {
      "title": "장면 제목",
      "content": "이 장면의 나레이션 내용",
      "imagePrompt": "A detailed DALL-E 3 image generation prompt in English for this scene. Photorealistic, cinematic. Describe specific subjects, environment, lighting, camera angle, mood. No text or watermarks. 16:9 composition."
    }
  ]
}

요구사항:
- 총 ${dur.minScenes}~${dur.maxScenes}개 장면으로 구성
- 전체 스크립트는 약 ${dur.targetWords}자 (${dur.label} 분량)
- 각 장면은 명확한 주제를 가짐
- 한국어로 작성
- 흥미롭고 시청자를 사로잡는 내용
- keyPhrase: 영상 썸네일이나 인트로에 쓸 수 있는 가장 강렬한 핵심 문구 (15자 이내)
- imagePrompt: 각 장면을 시각적으로 표현하는 영어 DALL-E 3 프롬프트. 구체적인 피사체, 배경, 조명, 카메라 앵글, 분위기를 묘사. 사진처럼 사실적이고 영화적인 구도${characterDescription ? `\n- 모든 imagePrompt에 반드시 이 캐릭터를 포함할 것: "${characterDescription}"` : ""}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse script JSON");

    const result = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      keyPhrase: result.keyPhrase ?? "",
      script: result.script,
      scenes: result.scenes.map((s: { title: string; content: string; imagePrompt?: string }) => ({
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
