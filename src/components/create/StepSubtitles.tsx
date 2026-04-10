"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Captions, Loader2, ChevronRight, ChevronLeft, CheckCircle, Type } from "lucide-react";
import type { VideoProject } from "@/app/create/page";

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
  onPrev: () => void;
};

const SUBTITLE_STYLES = [
  { id: "white", label: "기본 흰색", preview: "text-white", bg: "bg-black/60" },
  { id: "yellow", label: "노란색 강조", preview: "text-yellow-300", bg: "bg-black/70" },
  { id: "outline", label: "외곽선 스타일", preview: "text-white [text-shadow:_2px_2px_4px_rgb(0_0_0)]", bg: "" },
];

type SubtitleEntry = { start: number; end: number; text: string };

export function StepSubtitles({ project, updateProject, onNext, onPrev }: Props) {
  const [loading, setLoading] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("white");
  const [subtitledVideoUrl, setSubtitledVideoUrl] = useState(project.subtitledVideoUrl ?? "");

  const generateSubtitles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/generate/subtitles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: project.audioUrl,
          videoUrl: project.videoUrl,
          style: selectedStyle,
        }),
      });
      const data = await res.json();
      setSubtitles(data.subtitles);
      setSubtitledVideoUrl(data.subtitledVideoUrl);
      updateProject({ subtitledVideoUrl: data.subtitledVideoUrl });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1).padStart(4, "0");
    return `${m}:${s}`;
  };

  const handleNext = () => {
    updateProject({ subtitledVideoUrl });
    onNext();
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
              Whisper AI가 음성을 분석해 정확한 자막을 삽입합니다
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Style Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium">자막 스타일</label>
          <div className="grid grid-cols-3 gap-3">
            {SUBTITLE_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={`p-3 rounded-xl border text-center transition-all
                  ${selectedStyle === style.id ? "border-primary bg-primary/5" : "border-border/50 bg-muted/30 hover:border-border"}`}
              >
                <div className={`h-8 rounded-lg flex items-center justify-center mb-2 ${style.bg || "bg-gray-700"}`}>
                  <span className={`text-xs font-bold ${style.preview}`}>자막</span>
                </div>
                <div className="text-xs font-medium">{style.label}</div>
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
            <><Type className="w-4 h-4" /> 자막 생성하기</>
          )}
        </Button>

        {/* Subtitle Result */}
        {subtitles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium">자막 생성 완료</span>
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
                {subtitles.length}개 자막
              </Badge>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
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
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onPrev} disabled={loading} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <Button onClick={handleNext} disabled={!subtitledVideoUrl} className="gap-2">
            다음: 완료
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
