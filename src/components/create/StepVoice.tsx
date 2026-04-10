"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Loader2, ChevronRight, ChevronLeft, Play, Pause, Volume2 } from "lucide-react";
import type { VideoProject } from "@/app/create/page";

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
  onPrev: () => void;
};

const VOICES = [
  { id: "rachel", name: "Nova", desc: "자연스럽고 따뜻한 여성 목소리", gender: "여성" },
  { id: "adam",   name: "Onyx", desc: "차분하고 신뢰감 있는 남성 목소리", gender: "남성" },
  { id: "bella",  name: "Shimmer", desc: "밝고 활기찬 여성 목소리", gender: "여성" },
  { id: "josh",   name: "Echo", desc: "젊고 에너지 넘치는 남성 목소리", gender: "남성" },
];

export function StepVoice({ project, updateProject, onNext, onPrev }: Props) {
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(project.audioUrl ?? "");
  const [playing, setPlaying] = useState(false);

  const proxyUrl = (url: string) =>
    url ? `/api/proxy?url=${encodeURIComponent(url)}` : "";
  const [progress, setProgress] = useState(0);
  const [playError, setPlayError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    // Force reload when URL changes
    audio.load();
    setPlaying(false);
    setProgress(0);

    const onEnded = () => setPlaying(false);
    const onTimeUpdate = () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [audioUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        setPlayError("");
        await audio.play();
        setPlaying(true);
      } catch (err: any) {
        console.error("Audio play failed:", err);
        setPlayError(err?.message ?? "재생 실패");
      }
    }
  };

  const generateVoice = async () => {
    setLoading(true);
    setPlaying(false);
    setProgress(0);
    try {
      const res = await fetch("/api/generate/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: project.script, voiceId: selectedVoice }),
      });
      const data = await res.json();
      setAudioUrl(data.audioUrl);
      updateProject({ audioUrl: data.audioUrl });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    updateProject({ audioUrl });
    onNext();
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Mic className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-lg">음성 생성</div>
            <div className="text-sm font-normal text-muted-foreground mt-0.5">
              OpenAI TTS가 스크립트를 자연스러운 음성으로 변환합니다
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Voice Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium">목소리 선택</label>
          <div className="grid grid-cols-2 gap-3">
            {VOICES.map((voice) => (
              <button
                key={voice.id}
                onClick={() => setSelectedVoice(voice.id)}
                className={`p-4 rounded-xl border text-left transition-all duration-200
                  ${selectedVoice === voice.id
                    ? "border-primary bg-primary/5"
                    : "border-border/50 bg-muted/30 hover:border-border"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${selectedVoice === voice.id ? "bg-primary/20" : "bg-muted"}`}>
                    <Volume2 className={`w-4 h-4 ${selectedVoice === voice.id ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{voice.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{voice.desc}</div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{voice.gender}</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Script preview */}
        <div className="p-4 rounded-xl bg-muted/50 border border-border/30">
          <div className="text-xs text-muted-foreground mb-2 font-medium">스크립트 미리보기</div>
          <p className="text-sm leading-relaxed line-clamp-3 text-muted-foreground">
            {project.script ?? "스크립트를 먼저 생성해주세요"}
          </p>
        </div>

        {/* Generate Button */}
        <Button
          onClick={generateVoice}
          disabled={loading || !project.script}
          className="w-full gap-2 h-11"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> 음성 생성 중...</>
          ) : (
            <><Mic className="w-4 h-4" /> {audioUrl ? "재생성" : "음성 생성하기"}</>
          )}
        </Button>

        {/* Audio Player */}
        {audioUrl && (
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-3">
            <audio ref={audioRef} src={proxyUrl(audioUrl)} preload="auto" />
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0 hover:bg-blue-600 transition-colors"
              >
                {playing
                  ? <Pause className="w-4 h-4 text-white" />
                  : <Play className="w-4 h-4 text-white ml-0.5" />
                }
              </button>
              <div className="flex-1 space-y-1">
                <div className="text-sm font-medium">
                  {VOICES.find(v => v.id === selectedVoice)?.name} 목소리
                </div>
                {/* Progress bar */}
                <div
                  className="h-1.5 bg-blue-500/20 rounded-full overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const audio = audioRef.current;
                    if (!audio) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    audio.currentTime = ratio * audio.duration;
                  }}
                >
                  <div
                    className="h-full bg-blue-400 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 shrink-0">
                준비됨
              </Badge>
            </div>
            {playError && (
              <p className="text-xs text-destructive mt-1">에러: {playError}</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onPrev} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <Button onClick={handleNext} disabled={!audioUrl} className="gap-2">
            다음: 이미지 생성
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
