"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Loader2, ChevronRight, ChevronLeft, Play, Pause, Volume2, Save, Coins } from "lucide-react";
import type { VideoProject } from "@/app/create/page";
import { createBrowserClient } from "@/lib/supabase";
import { voiceCreditCost } from "@/lib/credits";

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
  onPrev: () => void;
  onSave: () => void;
};

type SupertoneVoice = {
  voice_id: string;
  name: string;
  description: string;
  age: string;
  gender: string;
  use_case: string;
  styles: string[];
  thumbnail_image_url: string;
  preview_url: string;
};

const VOICES = [
  { id: "brian",   name: "Brian",   desc: "깊고 안정적인 남성 목소리",          gender: "남성" },
  { id: "george",  name: "George",  desc: "따뜻하고 설득력 있는 스토리텔러",    gender: "남성" },
  { id: "eric",    name: "Eric",    desc: "부드럽고 신뢰감 있는 남성 목소리",   gender: "남성" },
  { id: "sarah",   name: "Sarah",   desc: "성숙하고 안정감 있는 여성 목소리",   gender: "여성" },
  { id: "jessica", name: "Jessica", desc: "밝고 활기차며 친근한 여성 목소리",   gender: "여성" },
  { id: "matilda", name: "Matilda", desc: "전문적이고 지식감 있는 여성 목소리", gender: "여성" },
];

const STYLE_LABELS: Record<string, string> = {
  neutral: "기본",
  happy: "밝게",
  sad: "슬프게",
  angry: "강하게",
  calm: "차분하게",
  excited: "신나게",
};

export function StepVoice({ project, updateProject, onNext, onPrev, onSave }: Props) {
  const [justSaved, setJustSaved] = useState(false);
  const handleSave = () => { onSave(); setJustSaved(true); setTimeout(() => setJustSaved(false), 2000); };
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(project.audioUrl ?? "");
  const [playing, setPlaying] = useState(false);
  const [creditError, setCreditError] = useState("");

  // Supertone state
  const [useSupertone, setUseSupertone] = useState(false);
  const [supertoneVoices, setSupertoneVoices] = useState<SupertoneVoice[]>([]);
  const [supertoneVoiceId, setSupertoneVoiceId] = useState("");
  const [supertoneStyle, setSupertoneStyle] = useState("neutral");
  const [supertoneLoading, setSupertoneLoading] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const proxyUrl = (url: string) =>
    url ? `/api/proxy?url=${encodeURIComponent(url)}` : "";
  const [progress, setProgress] = useState(0);
  const [playError, setPlayError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  // Load Supertone voices when toggle is enabled
  useEffect(() => {
    if (!useSupertone || supertoneVoices.length > 0) return;
    setSupertoneLoading(true);
    fetch("/api/voices/supertone")
      .then((r) => r.json())
      .then((d) => {
        const voices: SupertoneVoice[] = d.voices ?? [];
        setSupertoneVoices(voices);
        if (voices.length > 0 && !supertoneVoiceId) {
          setSupertoneVoiceId(voices[0].voice_id);
          setSupertoneStyle(voices[0].styles?.[0] ?? "neutral");
        }
      })
      .catch(console.error)
      .finally(() => setSupertoneLoading(false));
  }, [useSupertone]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

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
    setCreditError("");
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/generate/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          script: project.script,
          voiceId: selectedVoice,
          duration: project.duration ?? "short",
          useSupertone,
          supertoneVoiceId,
          supertoneStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreditError(data.error ?? "오류가 발생했습니다");
        return;
      }
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

  const selectedSupertoneVoice = supertoneVoices.find((v) => v.voice_id === supertoneVoiceId);

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className={`p-2 rounded-xl border ${useSupertone ? "bg-emerald-500/10 border-emerald-500/20" : "bg-blue-500/10 border-blue-500/20"}`}>
            <Mic className={`w-5 h-5 ${useSupertone ? "text-emerald-400" : "text-blue-400"}`} />
          </div>
          <div>
            <div className="text-lg">음성 생성</div>
            <div className="text-sm font-normal text-muted-foreground mt-0.5">
              AI가 스크립트를 자연스러운 음성으로 변환합니다
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* 한국어 특화 Toggle */}
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all duration-200 select-none
            ${useSupertone
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-muted/30 border-border/50 hover:border-border"
            }`}
          onClick={() => setUseSupertone((v) => !v)}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🇰🇷</span>
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                한국어 특화
                <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                  Supertone
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                한국어에 최적화된 AI 음성을 사용합니다
              </div>
            </div>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${useSupertone ? "bg-emerald-500" : "bg-muted"}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${useSupertone ? "left-[22px]" : "left-0.5"}`} />
          </div>
        </div>

        {/* Supertone Voice Grid */}
        {useSupertone && (
          <div className="space-y-3">
            <label className="text-sm font-medium">한국어 목소리 선택</label>
            {supertoneLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                목소리 목록을 불러오는 중...
              </div>
            ) : supertoneVoices.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                사용 가능한 한국어 목소리가 없습니다
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {supertoneVoices.map((voice) => {
                  const isSelected = supertoneVoiceId === voice.voice_id;
                  const isPreviewing = previewingId === voice.voice_id;
                  const genderLabel = voice.gender === "male" ? "남성" : voice.gender === "female" ? "여성" : voice.gender;
                  return (
                    <button
                      key={voice.voice_id}
                      onClick={() => {
                        setSupertoneVoiceId(voice.voice_id);
                        setSupertoneStyle(voice.styles?.[0] ?? "neutral");
                      }}
                      className={`p-3 rounded-xl border text-left transition-all duration-200
                        ${isSelected
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-border/50 bg-muted/30 hover:border-border"
                        }`}
                    >
                      {/* Thumbnail + name row */}
                      <div className="flex items-center gap-2 mb-2">
                        {voice.thumbnail_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={voice.thumbnail_image_url}
                            alt={voice.name}
                            className="w-9 h-9 rounded-full object-cover shrink-0 border border-border/30"
                          />
                        ) : (
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isSelected ? "bg-emerald-500/20" : "bg-muted"}`}>
                            <Volume2 className={`w-4 h-4 ${isSelected ? "text-emerald-400" : "text-muted-foreground"}`} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{voice.name}</div>
                          {genderLabel && (
                            <div className="text-[10px] text-muted-foreground">{genderLabel}{voice.age ? ` · ${voice.age}` : ""}</div>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      {voice.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed mb-2 line-clamp-2">
                          {voice.description}
                        </p>
                      )}

                      {/* use_case badge + preview button */}
                      <div className="flex items-center gap-1.5 mt-1">
                        {voice.use_case && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border/40 text-muted-foreground shrink-0">
                            {voice.use_case}
                          </span>
                        )}
                        {voice.preview_url && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPreviewing) {
                                previewAudioRef.current?.pause();
                                setPreviewingId(null);
                              } else {
                                if (previewAudioRef.current) {
                                  previewAudioRef.current.pause();
                                }
                                const audio = new Audio(voice.preview_url);
                                previewAudioRef.current = audio;
                                audio.play().catch(console.error);
                                setPreviewingId(voice.voice_id);
                                audio.onended = () => setPreviewingId(null);
                              }
                            }}
                            className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors
                              ${isPreviewing
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                : "bg-muted border-border/50 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400"
                              }`}
                          >
                            {isPreviewing
                              ? <><Pause className="w-2.5 h-2.5" /> 중지</>
                              : <><Play className="w-2.5 h-2.5" /> 미리듣기</>
                            }
                          </button>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Style Selector */}
            {selectedSupertoneVoice && selectedSupertoneVoice.styles.length > 1 && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">말투 스타일</label>
                <div className="flex flex-wrap gap-2">
                  {selectedSupertoneVoice.styles.map((style) => (
                    <button
                      key={style}
                      onClick={() => setSupertoneStyle(style)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border
                        ${supertoneStyle === style
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                          : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border"
                        }`}
                    >
                      {STYLE_LABELS[style] ?? style}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ElevenLabs Voice Grid (shown when Supertone is OFF) */}
        {!useSupertone && (
          <div className="space-y-3">
            <label className="text-sm font-medium">목소리 선택</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {VOICES.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`p-3 rounded-xl border text-left transition-all duration-200
                    ${selectedVoice === voice.id
                      ? "border-primary bg-primary/5"
                      : "border-border/50 bg-muted/30 hover:border-border"
                    }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${selectedVoice === voice.id ? "bg-primary/20" : "bg-muted"}`}>
                      <Volume2 className={`w-4 h-4 ${selectedVoice === voice.id ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="font-medium text-sm">{voice.name}</div>
                    <Badge variant="outline" className="text-xs ml-auto shrink-0">{voice.gender}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{voice.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Script preview */}
        <div className="p-4 rounded-xl bg-muted/50 border border-border/30">
          <div className="text-xs text-muted-foreground mb-2 font-medium">스크립트 미리보기</div>
          <p className="text-sm leading-relaxed text-muted-foreground max-h-40 overflow-y-auto pr-1">
            {project.script ?? "스크립트를 먼저 생성해주세요"}
          </p>
        </div>

        {/* Generate Button */}
        <div className="space-y-2">
          <Button
            onClick={generateVoice}
            disabled={loading || !project.script || (useSupertone && !supertoneVoiceId)}
            className={`w-full gap-2 h-11 ${useSupertone ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 음성 생성 중...</>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                {audioUrl ? "재생성" : "음성 생성하기"}
                <span className="ml-auto flex items-center gap-1 text-xs opacity-70">
                  <Coins className="w-3 h-3" />
                  {voiceCreditCost(project.duration ?? "short").toLocaleString()}
                </span>
              </>
            )}
          </Button>
          {creditError && (
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {creditError}
            </div>
          )}
        </div>

        {/* Audio Player */}
        {audioUrl && (
          <div className={`p-4 rounded-xl border space-y-3 ${useSupertone ? "bg-emerald-500/10 border-emerald-500/20" : "bg-blue-500/10 border-blue-500/20"}`}>
            <audio ref={audioRef} src={proxyUrl(audioUrl)} preload="auto" />
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${useSupertone ? "bg-emerald-500 hover:bg-emerald-600" : "bg-blue-500 hover:bg-blue-600"}`}
              >
                {playing
                  ? <Pause className="w-4 h-4 text-white" />
                  : <Play className="w-4 h-4 text-white ml-0.5" />
                }
              </button>
              <div className="flex-1 space-y-1">
                <div className="text-sm font-medium">
                  {useSupertone
                    ? (selectedSupertoneVoice?.name ?? "한국어 목소리")
                    : VOICES.find(v => v.id === selectedVoice)?.name + " 목소리"
                  }
                </div>
                <div
                  className={`h-1.5 rounded-full overflow-hidden cursor-pointer ${useSupertone ? "bg-emerald-500/20" : "bg-blue-500/20"}`}
                  onClick={(e) => {
                    const audio = audioRef.current;
                    if (!audio) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    audio.currentTime = ratio * audio.duration;
                  }}
                >
                  <div
                    className={`h-full rounded-full transition-all ${useSupertone ? "bg-emerald-400" : "bg-blue-400"}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <Badge variant="outline" className={`shrink-0 ${useSupertone ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                준비됨
              </Badge>
            </div>
            {playError && (
              <p className="text-xs text-destructive mt-1">에러: {playError}</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onPrev} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={!audioUrl} className="gap-1.5 text-muted-foreground">
            <Save className="w-3.5 h-3.5" />
            {justSaved ? "저장됨 ✓" : "임시 저장"}
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
