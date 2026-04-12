import { NextRequest, NextResponse } from "next/server";
import { getCredits } from "@/lib/credits";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const credits = await getCredits(token);
  if (credits === null) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json({ credits });
}
