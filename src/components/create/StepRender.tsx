"use client";

import { useState } from "react";

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Clapperboard, Loader2, ChevronRight, ChevronLeft,
  CheckCircle, Save, Zap, Music, RotateCcw, Play, Pause, Type,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { VideoProject } from "@/app/create/page";
import { INTRO_MUSIC_OPTIONS } from "@/lib/introMusic";
import { createBrowserClient } from "@/lib/supabase";
import { CREDIT_COSTS } from "@/lib/credits";

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
  onPrev: () => void;
  onSave: () => void;
};

const RENDER_STEPS = [
  "스크립트 분석 중...",
  "슬라이드 레이아웃 생성 중...",
  "이미지 배치 중...",
  "음성 동기화 중...",
  "트랜지션 적용 중...",
  "영상 인코딩 중...",
];

export function StepRender({ project, updateProject, onNext, onPrev, onSave }: Props) {
  const [justSaved, setJustSaved] = useState(false);
  const handleSave = () => { onSave(); setJustSaved(true); setTimeout(() => setJustSaved(false), 2000); };
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStepMsg, setCurrentStepMsg] = useState("");
  const [videoUrl, setVideoUrl] = useState(project.videoUrl ?? "");
  const [done, setDone] = useState(!!project.videoUrl);

  const [errorMsg, setErrorMsg] = useState("");
  const [addHighlightIntro, setAddHighlightIntro] = useState(
    project.addHighlightIntro ?? !!project.keyPhrase
  );
  const [introMusicId, setIntroMusicId] = useState(
    project.introMusicId ?? "upbeat"
  );
  // Text style
  const isShorts = project.duration === "short";
  const [keyFontSize, setKeyFontSize] = useState(() => lsGet("mm_render_keyFontSize", 58));
  const [keyFontColor, setKeyFontColor] = useState(() => lsGet("mm_render_keyFontColor", "white"));
  const [keyFontName, setKeyFontName] = useState(() => lsGet("mm_render_keyFontName", "NanumGothic-ExtraBold"));
  const [keyTextPosition, setKeyTextPosition] = useState(() => lsGet("mm_render_keyTextPosition", isShorts ? 8 : 42));

  const startRender = async () => {
    setLoading(true);
    setProgress(0);
    setDone(false);
    setErrorMsg("");

    const { data: { session } } = await createBrowserClient().auth.getSession();
    const token = session?.access_token ?? "";

    // Simulate progress
    for (let i = 0; i < RENDER_STEPS.length; i++) {
      setCurrentStepMsg(RENDER_STEPS[i]);
      setProgress(Math.round(((i + 1) / RENDER_STEPS.length) * 85));
      await new Promise((r) => setTimeout(r, 1200));
    }

    if (addHighlightIntro && project.keyPhrase) {
      setCurrentStepMsg("하이라이트 인트로 생성 중...");
    }

    try {
      const res = await fetch("/api/generate/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          script: project.script,
          scenes: project.scenes,
          audioUrl: project.audioUrl,
          imageUrls: project.imageUrls,
          keyPhrase: project.keyPhrase ?? "",
          introMusicId: addHighlightIntro ? introMusicId : "",
          addHighlightIntro,
          topic: project.topic ?? "",
          duration: project.duration ?? "short",
          keyFontSize,
          keyFontColor,
          keyFontName,
          keyTextPosition,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "영상 렌더링에 실패했습니다");
        return;
      }
      setProgress(100);
      const introMsg = addHighlightIntro && project.keyPhrase
        ? (data.introAdded ? "완료! (인트로 포함)" : "완료! (인트로 생성 실패 — 메인 영상만 저장됨)")
        : "완료!";
      setCurrentStepMsg(introMsg);
      setVideoUrl(data.videoUrl);
      updateProject({ videoUrl: data.videoUrl, addHighlightIntro, introMusicId, introAdded: data.introAdded ?? false });
      setDone(true);
    } catch (e) {
      console.error(e);
      setErrorMsg("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    updateProject({ videoUrl, addHighlightIntro, introMusicId });
    onNext();
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Clapperboard className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-lg">영상 렌더링</div>
            <div className="text-sm font-normal text-muted-foreground mt-0.5">
              슬라이드, 이미지, 음성을 조합해 영상을 만듭니다
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Assets summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "스크립트", value: `${project.scenes?.length ?? 0}장면`, ok: !!project.script },
            { label: "음성", value: "준비됨", ok: !!project.audioUrl },
            {
              label: "미디어",
              value: (() => {
                const types = project.mediaTypes ?? [];
                const imgs = types.filter(t => t !== "video").length || (project.imageUrls?.length ?? 0);
                const vids = types.filter(t => t === "video").length;
                return types.length > 0
                  ? (vids > 0 ? `이미지 ${imgs}개·영상 ${vids}개` : `${imgs}개`)
                  : `${project.imageUrls?.length ?? 0}개`;
              })(),
              ok: (project.imageUrls?.length ?? 0) > 0,
            },
          ].map((item) => (
            <div key={item.label} className={`p-3 rounded-xl border text-center ${item.ok ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/50 border-border/30"}`}>
              <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
              <div className="text-sm font-medium">{item.value}</div>
              {item.ok && <CheckCircle className="w-3 h-3 text-emerald-400 mx-auto mt-1" />}
            </div>
          ))}
        </div>

        {/* Highlight Intro Settings */}
        {project.keyPhrase && (
          <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              onClick={() => setAddHighlightIntro((v) => !v)}
              disabled={loading}
            >
              <div className="flex items-center gap-3 text-left">
                <div className={`p-1.5 rounded-lg ${addHighlightIntro ? "bg-primary/10" : "bg-muted"}`}>
                  <Zap className={`w-4 h-4 ${addHighlightIntro ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <div className="text-sm font-medium">하이라이트 인트로</div>
                  <div className="text-xs text-muted-foreground mt-0.5">핵심 장면을 영상 앞에 미리 보여줍니다</div>
                </div>
              </div>
              <div className={`w-10 h-5.5 rounded-full transition-colors relative flex-shrink-0 ${addHighlightIntro ? "bg-primary" : "bg-muted-foreground/30"}`}
                style={{ width: 40, height: 22 }}>
                <div className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${addHighlightIntro ? "left-[18px]" : "left-[2px]"}`}
                  style={{ width: 18, height: 18, left: addHighlightIntro ? 20 : 2 }} />
              </div>
            </button>

            {addHighlightIntro && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/30">
                {/* Key phrase preview */}
                <div className="pt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
                  <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-sm font-semibold truncate">{project.keyPhrase}</span>
                </div>

                {/* Intro music selector */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Music className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">인트로 음악</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setIntroMusicId("")}
                      disabled={loading}
                      className={`p-2 rounded-lg border text-xs transition-colors ${
                        introMusicId === ""
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border/50 hover:border-border"
                      }`}
                    >
                      없음
                    </button>
                    {INTRO_MUSIC_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setIntroMusicId(opt.id)}
                        disabled={loading}
                        className={`p-2 rounded-lg border text-xs transition-colors ${
                          introMusicId === opt.id
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border/50 hover:border-border"
                        }`}
                      >
                        <div>{opt.emoji}</div>
                        <div className="mt-0.5 leading-tight">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Style */}
                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-px bg-border/40" />
                    <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <Type className="w-3 h-3" /> 텍스트 스타일
                    </span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>

                  <div className="space-y-3">
                    {/* Color */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-10 shrink-0">색상</span>
                      <div className="flex gap-2">
                        {[
                          { value: "white",   bg: "#ffffff", label: "흰색" },
                          { value: "yellow",  bg: "#ffff00", label: "노랑" },
                          { value: "#ffaa00", bg: "#ffaa00", label: "주황" },
                          { value: "#00ffcc", bg: "#00ffcc", label: "민트" },
                        ].map((c) => (
                          <button
                            key={c.value}
                            onClick={() => { setKeyFontColor(c.value); lsSet("mm_render_keyFontColor", c.value); }}
                            title={c.label}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${keyFontColor === c.value ? "border-primary scale-110" : "border-border/50 hover:border-border"}`}
                            style={{ backgroundColor: c.bg }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Font */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-10 shrink-0">폰트</span>
                      <div className="flex gap-1.5">
                        {[
                          { id: "NanumGothic-ExtraBold", label: "ExtraBold" },
                          { id: "NanumGothic-Bold",      label: "Bold" },
                          { id: "NanumGothic",           label: "Regular" },
                        ].map((f) => (
                          <button
                            key={f.id}
                            onClick={() => { setKeyFontName(f.id); lsSet("mm_render_keyFontName", f.id); }}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all
                              ${keyFontName === f.id
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/50 text-muted-foreground hover:border-border"}`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Font size */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">글자 크기</span>
                        <span className="text-xs font-mono text-primary">{keyFontSize}px</span>
                      </div>
                      <Slider min={28} max={80} step={2} value={[keyFontSize]}
                        onValueChange={(v) => { const val = Array.isArray(v) ? v[0] : v; setKeyFontSize(val); lsSet("mm_render_keyFontSize", val); }} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>작게 (28)</span><span>크게 (80)</span>
                      </div>
                    </div>

                    {/* Position */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">세로 위치</span>
                        <span className="text-xs font-mono text-primary">
                          {keyTextPosition <= 15 ? "상단" : keyTextPosition <= 35 ? "상중단" : keyTextPosition <= 55 ? "중앙" : keyTextPosition <= 75 ? "하중단" : "하단"}
                        </span>
                      </div>
                      <Slider min={5} max={90} step={5} value={[keyTextPosition]}
                        onValueChange={(v) => { const val = Array.isArray(v) ? v[0] : v; setKeyTextPosition(val); lsSet("mm_render_keyTextPosition", val); }} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>상단</span><span>하단</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
            {errorMsg}
          </div>
        )}

        {/* Render Button */}
        {!loading && !done && (
          <Button onClick={startRender} className="w-full gap-2 h-11">
            <Clapperboard className="w-4 h-4" />
            영상 렌더링 시작
            <span className="ml-auto text-xs opacity-70">{CREDIT_COSTS.render} 크레딧</span>
          </Button>
        )}

        {/* Re-render Button */}
        {!loading && done && (
          <Button
            variant="outline"
            onClick={() => { setDone(false); setVideoUrl(""); setProgress(0); setCurrentStepMsg(""); setErrorMsg(""); }}
            className="w-full gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            다시 렌더링
          </Button>
        )}

        {/* Progress */}
        {loading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {currentStepMsg}
              </div>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Done */}
        {done && videoUrl && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-medium">렌더링 완료!</div>
                <div className="text-xs text-muted-foreground">영상이 성공적으로 만들어졌습니다</div>
              </div>
              <Badge variant="outline" className="ml-auto bg-emerald-500/10 text-emerald-400 border-emerald-500/20">완료</Badge>
            </div>
            <div className={`rounded-xl overflow-hidden bg-muted flex items-center justify-center ${project.duration === "short" ? "aspect-[9/16] max-w-[260px] mx-auto" : "aspect-video"}`}>
              <video src={videoUrl} controls className="w-full h-full" />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onPrev} disabled={loading} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={!done} className="gap-1.5 text-muted-foreground">
            <Save className="w-3.5 h-3.5" />
            {justSaved ? "저장됨 ✓" : "임시 저장"}
          </Button>
          <Button onClick={handleNext} disabled={!done} className="gap-2">
            다음: 자막 삽입
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
