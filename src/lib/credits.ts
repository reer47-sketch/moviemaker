import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { DURATION_OPTIONS } from "@/lib/introMusic";

export const CREDIT_COSTS = {
  voice: { short: 100, "2min": 200, "3min": 300, "5min": 500, "10min": 1000 },
  image: 100,       // per image
  videoClip: 2000,  // per clip
  subtitles: 100,
  render: 50,
} as const;

export function voiceCreditCost(duration: string): number {
  return CREDIT_COSTS.voice[duration as keyof typeof CREDIT_COSTS.voice] ?? 100;
}

export function durationLabel(duration: string): string {
  return DURATION_OPTIONS.find((d) => d.id === duration)?.label ?? duration;
}

/** Server-side: verify auth token, check credits, deduct atomically.
 *  Returns { userId } on success, or a NextResponse error to return immediately. */
export async function deductCredits(
  req: NextRequest,
  amount: number
): Promise<{ userId: string } | NextResponse> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json(
      { error: "로그인이 필요합니다", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // Verify token and get user
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await anonClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // Use service client to bypass RLS for credit operations
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await service
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  const current = profile?.credits ?? 0;
  if (current < amount) {
    return NextResponse.json(
      {
        error: `크레딧이 부족합니다. 필요: ${amount.toLocaleString()}, 보유: ${current.toLocaleString()}`,
        code: "INSUFFICIENT_CREDITS",
        required: amount,
        available: current,
      },
      { status: 402 }
    );
  }

  const { error } = await service
    .from("profiles")
    .update({ credits: current - amount })
    .eq("id", user.id);

  if (error) throw error;

  return { userId: user.id };
}

/** Server-side: get credit balance for a token */
export async function getCredits(token: string): Promise<number | null> {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await anonClient.auth.getUser();
  if (!user) return null;

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data } = await service
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  return data?.credits ?? null;
}
