"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase";
import { LogIn, LogOut, User, Coins } from "lucide-react";

export function NavUser() {
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchCredits = async (token: string) => {
    try {
      const res = await fetch("/api/credits", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits);
      }
    } catch {}
  };

  useEffect(() => {
    const supabase = createBrowserClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
      if (session?.access_token) fetchCredits(session.access_token);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setEmail(session?.user?.email ?? null);
      if (session?.access_token) fetchCredits(session.access_token);
      else setCredits(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    setEmail(null);
    setCredits(null);
    router.refresh();
  };

  if (loading) return <div className="w-20 h-8 rounded-lg bg-muted animate-pulse" />;

  if (email) {
    return (
      <div className="flex items-center gap-2">
        {credits !== null && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400">
              {credits.toLocaleString()}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border/50">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground max-w-32 truncate">{email}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-muted-foreground">
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">로그아웃</span>
        </Button>
      </div>
    );
  }

  return (
    <Link href="/auth">
      <Button variant="outline" size="sm" className="gap-1.5">
        <LogIn className="w-3.5 h-3.5" />
        로그인
      </Button>
    </Link>
  );
}
