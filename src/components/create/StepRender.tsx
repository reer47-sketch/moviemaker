"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clapperboard, Loader2, ChevronRight, ChevronLeft, CheckCircle, Film } from "lucide-react";
import type { VideoProject } from "@/app/create/page";

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
  onPrev: () => void;
};

const RENDER_STEPS = [
  "스크립트 분석 중...",
  "슬라이드 레이아웃 생성 중...",
  "이미지 배치 중...",
  "음성 동기화 중...",
  "트랜지션 적용 중...",
  "영상 인코딩 중...",
];

export function StepRender({ project, updateProject, onNext, onPrev }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStepMsg, setCurrentStepMsg] = useState("");
  const [videoUrl, setVideoUrl] = useState(project.videoUrl ?? "");
  const [done, setDone] = useState(!!project.videoUrl);

  const startRender = async () => {
    setLoading(true);
    setProgress(0);
    setDone(false);

    // Simulate progress
    for (let i = 0; i < RENDER_STEPS.length; i++) {
      setCurrentStepMsg(RENDER_STEPS[i]);
      setProgress(Math.round(((i + 1) / RENDER_STEPS.length) * 90));
      await new Promise((r) => setTimeout(r, 1200));
    }

    try {
      const res = await fetch("/api/generate/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: project.script,
          scenes: project.scenes,
          audioUrl: project.audioUrl,
          imageUrls: project.imageUrls,
        }),
      });
      const data = await res.json();
      setProgress(100);
      setCurrentStepMsg("완료!");
      setVideoUrl(data.videoUrl);
      updateProject({ videoUrl: data.videoUrl });
      setDone(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    updateProject({ videoUrl });
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
            { label: "이미지", value: `${project.imageUrls?.length ?? 0}개`, ok: (project.imageUrls?.length ?? 0) > 0 },
          ].map((item) => (
            <div key={item.label} className={`p-3 rounded-xl border text-center ${item.ok ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/50 border-border/30"}`}>
              <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
              <div className="text-sm font-medium">{item.value}</div>
              {item.ok && <CheckCircle className="w-3 h-3 text-emerald-400 mx-auto mt-1" />}
            </div>
          ))}
        </div>

        {/* Render Button */}
        {!loading && !done && (
          <Button onClick={startRender} className="w-full gap-2 h-11">
            <Clapperboard className="w-4 h-4" />
            영상 렌더링 시작
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
            <div className="aspect-video rounded-xl overflow-hidden bg-muted flex items-center justify-center">
              <video src={videoUrl} controls className="w-full h-full" />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onPrev} disabled={loading} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            이전
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
