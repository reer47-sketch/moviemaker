"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Film, Mail, Lock, Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

type Mode = "login" | "signup";

function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "signup" && password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    const supabase = createBrowserClient();

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.refresh();
        router.push(next);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess("가입이 완료됐습니다! 이메일을 확인해 인증 링크를 클릭하거나, 바로 로그인해 보세요.");
      }
    } catch (err: any) {
      const msg = err?.message ?? "오류가 발생했습니다.";
      if (msg.includes("Invalid login credentials")) setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      else if (msg.includes("already registered") || msg.includes("User already")) setError("이미 사용 중인 이메일입니다.");
      else if (msg.includes("Email not confirmed")) setError("이메일 인증이 필요합니다. 받은 편지함을 확인해 주세요.");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-border/50 px-6 py-4 flex items-center bg-background/80 backdrop-blur-sm">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Film className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">MovieMaker</span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-1">
              {mode === "login" ? "로그인" : "회원가입"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {mode === "login"
                ? "계정에 로그인하고 내 영상을 관리하세요"
                : "가입하고 AI 영상 제작을 시작하세요"}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl bg-muted p-1">
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
                  ${mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          <Card className="bg-card border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">
                {mode === "login" ? "계정 정보 입력" : "새 계정 만들기"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">이메일</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="이메일 주소"
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-muted border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">비밀번호</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="비밀번호 (6자 이상)"
                      required
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-muted border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password confirm (signup only) */}
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">비밀번호 확인</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type={showPw ? "text" : "password"}
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        placeholder="비밀번호 재입력"
                        required
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-muted border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    {error}
                  </div>
                )}

                {/* Success */}
                {success && (
                  <div className="px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {success}
                  </div>
                )}

                <Button type="submit" disabled={loading} className="w-full h-11 gap-2">
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
                  ) : mode === "login" ? "로그인" : "회원가입"}
                </Button>
              </form>

              {mode === "login" && (
                <p className="text-center text-xs text-muted-foreground mt-4">
                  계정이 없으신가요?{" "}
                  <button onClick={() => switchMode("signup")} className="text-primary hover:underline">
                    회원가입
                  </button>
                </p>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            AI 영상 제작을 위해 로그인이 필요합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
