"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Film,
  Sparkles,
  Mic,
  ImageIcon,
  Clapperboard,
  Captions,
  Download,
  ChevronRight,
  CheckCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { StepScript } from "@/components/create/StepScript";
import { StepVoice } from "@/components/create/StepVoice";
import { StepImages } from "@/components/create/StepImages";
import { StepRender } from "@/components/create/StepRender";
import { StepSubtitles } from "@/components/create/StepSubtitles";
import { StepDownload } from "@/components/create/StepDownload";

export type VideoProject = {
  topic: string;
  script: string;
  scenes: { title: string; content: string }[];
  audioUrl: string;
  imageUrls: string[];
  videoUrl: string;
  subtitledVideoUrl: string;
};

const STEPS = [
  { id: 1, label: "스크립트", icon: Sparkles, short: "스크립트" },
  { id: 2, label: "음성", icon: Mic, short: "음성" },
  { id: 3, label: "이미지", icon: ImageIcon, short: "이미지" },
  { id: 4, label: "렌더링", icon: Clapperboard, short: "렌더링" },
  { id: 5, label: "자막", icon: Captions, short: "자막" },
  { id: 6, label: "완료", icon: Download, short: "완료" },
];

export default function CreatePage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [project, setProject] = useState<Partial<VideoProject>>({});

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  const goNext = async () => {
    const next = Math.min(currentStep + 1, STEPS.length);
    setCurrentStep(next);
    // 마지막 단계 진입 시 DB 저장
    if (next === STEPS.length) {
      try {
        await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(project),
        });
      } catch (e) {
        console.error("Failed to save video:", e);
      }
    }
  };
  const goPrev = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const updateProject = (data: Partial<VideoProject>) => {
    setProject((prev) => ({ ...prev, ...data }));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border/50 px-6 py-4 flex items-center justify-between bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Film className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">MovieMaker</span>
        </Link>
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            대시보드
          </Button>
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">영상 제작</h1>
          <p className="text-muted-foreground">단계별로 진행하면 AI가 영상을 완성합니다</p>
        </div>

        {/* Step indicator */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isDone = currentStep > step.id;
              const isActive = currentStep === step.id;
              return (
                <div key={step.id} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                      ${isDone ? "bg-primary border-primary" : isActive ? "border-primary bg-primary/10" : "border-border bg-muted"}`}
                  >
                    {isDone ? (
                      <CheckCircle className="w-5 h-5 text-primary-foreground" />
                    ) : (
                      <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.short}
                  </span>
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-muted-foreground">단계 {currentStep} / {STEPS.length}</span>
            <span className="text-xs text-muted-foreground">{Math.round(progress)}% 완료</span>
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[400px]">
          {currentStep === 1 && (
            <StepScript project={project} updateProject={updateProject} onNext={goNext} />
          )}
          {currentStep === 2 && (
            <StepVoice project={project} updateProject={updateProject} onNext={goNext} onPrev={goPrev} />
          )}
          {currentStep === 3 && (
            <StepImages project={project} updateProject={updateProject} onNext={goNext} onPrev={goPrev} />
          )}
          {currentStep === 4 && (
            <StepRender project={project} updateProject={updateProject} onNext={goNext} onPrev={goPrev} />
          )}
          {currentStep === 5 && (
            <StepSubtitles project={project} updateProject={updateProject} onNext={goNext} onPrev={goPrev} />
          )}
          {currentStep === 6 && (
            <StepDownload project={project} />
          )}
        </div>
      </div>
    </div>
  );
}
