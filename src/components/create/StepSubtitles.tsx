"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Captions, Loader2, ChevronRight, ChevronLeft, CheckCircle, Type, Save, Coins } from "lucide-react";
import type { VideoProject } from "@/app/create/page";
import { createBrowserClient } from "@/lib/supabase";
import { CREDIT_COSTS } from "@/lib/credits";

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
  onPrev: () => void;
  onSave: () => void;
};

const SUBTITLE_STYLES = [
  { id: "white",   label: "기본 흰색",   textClass: "text-white",        bgClass: "bg-black/60" },
  { id: "yellow",  label: "노란색 강조", textClass: "text-yellow-300",   bgClass: "bg-black/70" },
  { id: "outline", label: "외곽선",      textClass: "text-white [text-shadow:_2px_2px_4px_rgb(0_0_0)]", bgClass: "bg-gray-700" },
];

const FONT_OPTIONS = [
  { id: "",               label: "기본체" },
  { id: "NanumGothic",    label: "나눔고딕" },
  { id: "NanumMyeongjo",  label: "나눔명조" },
  { id: "Malgun Gothic",  label: "맑은 고딕" },
  { id: "Arial",          label: "Arial" },
];

type SubtitleEntry = { start: number; end: number; text: string };

export function StepSubtitles({ project, updateProject, onNext, onPrev, onSave }: Props) {
  const [justSaved, setJustSaved] = useState(false);
  const handleSave = () => { onSave(); setJustSaved(true); setTimeout(() => setJustSaved(false), 2000); };
  const [loading, setLoading] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("white");
  const [fontSize, setFontSize] = useState(24);
  const [fontName, setFontName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [subtitledVideoUrl, setSubtitledVideoUrl] = useState(
    project.subtitledVideoUrl ?? ""
  );

  const generateSubtitles = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const { data: { session } } = await createBrowserClient().auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/generate/subtitles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          audioUrl: project.audioUrl,
          videoUrl: project.videoUrl,
          script: project.script,
          style: selectedStyle,
          fontSize,
          fontName,
          introOffset: project.introAdded ? 6 : 0,
          language: project.language ?? "ko",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg((data.error ?? "자막 생성에 실패했습니다") + (data.detail ? `\n${data.detail}` : ""));
        return;
      }
      setSubtitles(data.subtitles ?? []);
      setSubtitledVideoUrl(data.subtitledVideoUrl);
      updateProject({ subtitledVideoUrl: data.subtitledVideoUrl });
    } catch (e) {
      console.error(e);
      setErrorMsg("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1).padStart(4, "0");
    return `${m}:${s}`;
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Captions className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-lg">자막 생성 및 삽입</div>
            <div className="text-sm font-normal text-muted-foreground mt-0.5">
              작성한 스크립트를 음성 타이밍에 맞춰 자막으로 삽입합니다
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Style */}
        <div className="space-y-3">
          <label className="text-sm font-medium">자막 스타일</label>
          <div className="grid grid-cols-3 gap-3">
            {SUBTITLE_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={`p-3 rounded-xl border text-center transition-all
                  ${selectedStyle === style.id
                    ? "border-primary bg-primary/5"
                    : "border-border/50 bg-muted/30 hover:border-border"}`}
              >
                <div className={`h-8 rounded-lg flex items-center justify-center mb-2 ${style.bgClass}`}>
                  <span className={`text-xs font-bold ${style.textClass}`}>자막</span>
                </div>
                <div className="text-xs font-medium">{style.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">글자 크기</label>
            <span className="text-sm font-mono text-primary">{fontSize}px</span>
          </div>
          <Slider
            min={14}
            max={44}
            step={2}
            value={[fontSize]}
            onValueChange={(v) => setFontSize(Array.isArray(v) ? v[0] : v)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>작게 (14)</span>
            <span>크게 (44)</span>
          </div>
        </div>

        {/* Font selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium">폰트</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFontName(f.id)}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all
                  ${fontName === f.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-muted/30 hover:border-border text-muted-foreground"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={generateSubtitles}
          disabled={loading || !project.videoUrl}
          className="w-full gap-2 h-11"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> 자막 생성 중...</>
          ) : (
            <>
              <Type className="w-4 h-4" /> 자막 생성하기
              <span className="ml-auto flex items-center gap-1 text-xs opacity-70">
                <Coins className="w-3 h-3" />{CREDIT_COSTS.subtitles}
              </span>
            </>
          )}
        </Button>

        {errorMsg && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
            {errorMsg}
          </div>
        )}

        {/* Result */}
        {subtitles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium">자막 생성 완료</span>
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
                {subtitles.length}개 자막
              </Badge>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {subtitles.map((sub, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50 border border-border/30">
                  <span className="text-xs font-mono text-muted-foreground shrink-0 mt-0.5">
                    {formatTime(sub.start)}
                  </span>
                  <span className="text-sm">{sub.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {subtitledVideoUrl && (
          <div className="aspect-video rounded-xl overflow-hidden bg-muted">
            <video src={subtitledVideoUrl} controls className="w-full h-full" />
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onPrev} disabled={loading} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={!subtitledVideoUrl} className="gap-1.5 text-muted-foreground">
            <Save className="w-3.5 h-3.5" />
            {justSaved ? "저장됨 ✓" : "임시 저장"}
          </Button>
          <Button
            onClick={() => { updateProject({ subtitledVideoUrl }); onNext(); }}
            disabled={!subtitledVideoUrl}
            className="gap-2"
          >
            다음: 완료
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
