"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ImageIcon, Loader2, ChevronRight, ChevronLeft,
  RefreshCw, Upload, X, Plus, Film, Sparkles, Video,
  AlertTriangle, CheckCircle2, GripVertical, ChevronUp, ChevronDown, Save, Download,
} from "lucide-react";
import type { VideoProject } from "@/app/create/page";
import { createBrowserClient } from "@/lib/supabase";
import { CREDIT_COSTS } from "@/lib/credits";

const DURATION_SECONDS: Record<string, number> = {
  short: 60, "2min": 120, "3min": 180, "5min": 300, "10min": 600,
};

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
  onPrev: () => void;
  onSave: () => void;
};

type MediaItem = { url: string; type: "image" | "video"; name?: string };

export function StepImages({ project, updateProject, onNext, onPrev, onSave }: Props) {
  const [justSaved, setJustSaved] = useState(false);
  const handleSave = () => { onSave(); setJustSaved(true); setTimeout(() => setJustSaved(false), 2000); };
  const [loading, setLoading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [genMode, setGenMode] = useState<"image" | "video">("image");
  const [genCount, setGenCount] = useState<number | "all">("all");
  const [videoLoading, setVideoLoading] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(
    (project.imageUrls ?? []).map((url) => ({ url, type: "image" as const }))
  );
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const[dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scenes = project.scenes ?? [];
  const isShorts = project.duration === "short";

  const syncUrls = (items: MediaItem[]) => {
    const urls = items.map((m) => m.url);
    const types = items.map((m) => m.type);
    updateProject({ imageUrls: urls, mediaTypes: types });
    setMediaItems(items);
  };

  /* ── 이미지 이동 ── */
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= mediaItems.length) return;
    const arr = [...mediaItems];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    syncUrls(arr);
  };

  /* ── 드래그 앤 드롭 ── */
  const handleDragStart = (i: number) => setDragIdx(i);
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOverIdx(i);
  };
  const handleDrop = (toIdx: number) => {
    if (dragIdx !== null && dragIdx !== toIdx) {
      moveItem(dragIdx, toIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const getToken = async () => {
    const { data: { session } } = await createBrowserClient().auth.getSession();
    return session?.access_token ?? "";
  };

  /* ── AI 생성 ── */
  const generateImages = async () => {
    setLoading(true);
    setImageError("");
    const targetScenes = genCount === "all" ? project.scenes : project.scenes?.slice(0, genCount);
    try {
      const token = await getToken();
      const res = await fetch("/api/generate/images", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scenes: targetScenes, duration: project.duration }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrls) {
        setImageError((data.error ?? "이미지 생성 실패") + (data.detail ? ` — ${data.detail}` : ""));
        return;
      }
      const items: MediaItem[] = data.imageUrls.map((url: string) => ({ url, type: "image" as const }));
      syncUrls([...mediaItems, ...items]);
    } catch (e) {
      console.error(e);
      setImageError("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const generateVideoClips = async () => {
    setVideoLoading(true);
    setImageError("");
    const count = genCount === "all" ? undefined : genCount;
    try {
      const token = await getToken();
      const res = await fetch("/api/generate/video-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scenes: project.scenes, count }),
      });
      const data = await res.json();
      if (!res.ok || !data.clipUrls) {
        setImageError((data.error ?? "영상 클립 생성 실패") + (data.detail ? ` — ${data.detail}` : ""));
        return;
      }
      const items: MediaItem[] = data.clipUrls.map((url: string) => ({ url, type: "video" as const, name: "grok-clip" }));
      syncUrls([...mediaItems, ...items]);
    } catch (e) {
      console.error(e);
      setImageError("네트워크 오류가 발생했습니다");
    } finally {
      setVideoLoading(false);
    }
  };

  const regenerateImage = async (idx: number) => {
    setRegeneratingIdx(idx);
    try {
      const token = await getToken();
      const res = await fetch("/api/generate/images", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scenes: [project.scenes?.[idx]], single: true, duration: project.duration }),
      });
      const data = await res.json();
      const updated = [...mediaItems];
      updated[idx] = { url: data.imageUrls[0], type: "image" };
      syncUrls(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setRegeneratingIdx(null);
    }
  };

  /* ── 파일 업로드 ── */
  const handleFileUpload = async (files: FileList) => {
    setUploading(true);
    const newItems: MediaItem[] = [];
    try {
      for (const file of Array.from(files)) {
        const signedRes = await fetch("/api/upload/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        });
        const { signedUrl, publicUrl } = await signedRes.json();
        if (!signedUrl) continue;
        await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        newItems.push({ url: publicUrl, type: file.type.startsWith("video/") ? "video" : "image", name: file.name });
      }
      syncUrls([...mediaItems, ...newItems]);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const removeItem = (idx: number) => syncUrls(mediaItems.filter((_, i) => i !== idx));

  const downloadItem = async (item: MediaItem, idx: number) => {
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(item.url)}`);
      const blob = await res.blob();
      const ext = item.type === "video" ? "mp4" : "jpg";
      const base = item.name
        ?? (project.keyPhrase
          ? `${project.keyPhrase.replace(/[\\/:*?"<>|]/g, "").trim()}-${idx + 1}`
          : `media-${idx + 1}`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = base.includes(".") ? base : `${base}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  /* ── 카운트 상태 ── */
  const diff = mediaItems.length - scenes.length;
  const countOk = diff === 0;

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
            <ImageIcon className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="text-lg">이미지 / 영상</div>
            <div className="text-sm font-normal text-muted-foreground mt-0.5">
              AI가 생성하거나 직접 업로드하세요
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        <Tabs defaultValue="media">
          <TabsList className="w-full">
            <TabsTrigger value="media" className="flex-1">미디어 관리</TabsTrigger>
            <TabsTrigger value="arrange" className="flex-1" disabled={mediaItems.length === 0}>
              장면 배치
              {mediaItems.length > 0 && (
                <Badge
                  variant="outline"
                  className={`ml-2 text-[10px] px-1.5 py-0 ${countOk ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}
                >
                  {countOk ? "✓" : `${mediaItems.length}/${scenes.length}`}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── 미디어 관리 탭 ─── */}
          <TabsContent value="media" className="space-y-4 pt-3">
            {/* Source tabs */}
            <Tabs defaultValue="ai">
              <TabsList className="w-full">
                <TabsTrigger value="ai" className="flex-1">AI 자동 생성</TabsTrigger>
                <TabsTrigger value="upload" className="flex-1">직접 업로드</TabsTrigger>
              </TabsList>

              <TabsContent value="ai" className="space-y-3 pt-2">
                {/* Engine toggle */}
                <div className="flex rounded-xl border border-border/50 overflow-hidden">
                  <button
                    onClick={() => setGenMode("image")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                      genMode === "image" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" /> 이미지
                  </button>
                  <button
                    onClick={() => setGenMode("video")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                      genMode === "video" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Video className="w-4 h-4" /> 영상 클립
                  </button>
                </div>

                {/* Count selector */}
                {scenes.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1.5">생성 개수</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: scenes.length }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          onClick={() => setGenCount(n)}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                            genCount === n
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/50 hover:border-border"
                          }`}
                        >
                          {n}개
                          {genMode === "video" && (
                            <span className="text-amber-400 ml-1">${(n * 0.4).toFixed(1)}</span>
                          )}
                        </button>
                      ))}
                      <button
                        onClick={() => setGenCount("all")}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                          genCount === "all"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 hover:border-border"
                        }`}
                      >
                        전체 ({scenes.length}개)
                        {genMode === "video" && (
                          <span className="text-amber-400 ml-1">${(scenes.length * 0.4).toFixed(1)}</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/30">
                  {genMode === "image" ? (
                    <><ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      AI 이미지 — <span className="text-foreground font-medium">{genCount === "all" ? scenes.length : genCount}개</span> 생성
                    </span></>
                  ) : (
                    <><Video className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      AI 영상 클립 — 클립당 8초 <span className="text-amber-400 font-medium">
                        (예상 비용: ${((genCount === "all" ? scenes.length : genCount) * 0.4).toFixed(1)})
                      </span>
                    </span></>
                  )}
                </div>

                {imageError && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                    {imageError}
                  </div>
                )}

                {genMode === "image" ? (
                  <Button
                    onClick={generateImages}
                    disabled={loading || scenes.length === 0}
                    className="w-full gap-2 h-11"
                    variant={mediaItems.filter(m => m.type === "image" && !m.name).length > 0 ? "outline" : "default"}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> 생성 중 ({genCount === "all" ? scenes.length : genCount}개)...</>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> AI 이미지 생성하기
                        <span className="ml-auto text-xs opacity-70">
                          {(CREDIT_COSTS.image * (genCount === "all" ? scenes.length : genCount)).toLocaleString()} 크레딧
                        </span>
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={generateVideoClips}
                    disabled={videoLoading || scenes.length === 0}
                    className="w-full gap-2 h-11"
                    variant="outline"
                  >
                    {videoLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> 영상 클립 생성 중... (수분 소요)</>
                    ) : (
                      <>
                        <Video className="w-4 h-4" /> AI 영상 클립 생성하기
                        <span className="ml-auto text-xs opacity-70">
                          {(CREDIT_COSTS.videoClip * (genCount === "all" ? scenes.length : genCount)).toLocaleString()} 크레딧
                        </span>
                      </>
                    )}
                  </Button>
                )}

              </TabsContent>

              <TabsContent value="upload" className="space-y-3 pt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-28 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 text-muted-foreground"
                >
                  {uploading ? (
                    <><Loader2 className="w-6 h-6 animate-spin" /><span className="text-sm">업로드 중...</span></>
                  ) : (
                    <>
                      <Upload className="w-6 h-6" />
                      <span className="text-sm font-medium">클릭하여 파일 선택</span>
                      <span className="text-xs">이미지 (JPG, PNG) · 영상 (MP4, MOV) · 여러 파일 동시 업로드</span>
                    </>
                  )}
                </button>
              </TabsContent>
            </Tabs>

            {/* Media grid */}
            {mediaItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">전체 미디어</span>
                  <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                    {mediaItems.length}개
                  </Badge>
                  {!countOk && (
                    <span className="text-xs text-amber-400 ml-auto">
                      장면 {scenes.length}개 · 이미지 {mediaItems.length}개
                    </span>
                  )}
                </div>
                <div className={`grid gap-3 max-h-64 overflow-y-auto pr-1 ${isShorts ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
                  {mediaItems.map((item, i) => (
                    <div key={i} className={`relative group rounded-xl overflow-hidden bg-muted ${isShorts ? "aspect-[9/16]" : "aspect-video"}`}>
                      {item.type === "video" ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-muted">
                          <Film className="w-6 h-6 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground truncate px-2 max-w-full">{item.name}</span>
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt={`Media ${i + 1}`} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {item.type === "image" && !item.name && (
                          <Button size="sm" variant="secondary" className="gap-1 h-7 text-xs"
                            onClick={() => regenerateImage(i)} disabled={regeneratingIdx === i}
                          >
                            {regeneratingIdx === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            재생성
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" className="h-7 w-7 p-0" onClick={() => downloadItem(item, i)} title="다운로드">
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 w-7 p-0" onClick={() => removeItem(i)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{i + 1}</Badge>
                        {item.type === "video" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-300 border-blue-500/30">영상</Badge>
                        )}
                        {item.name && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/20 text-emerald-300 border-emerald-500/30">직접업로드</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-video rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-1 text-muted-foreground"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-xs">추가</span>
                  </button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ─── 장면 배치 탭 ─── */}
          <TabsContent value="arrange" className="space-y-4 pt-3">

            {/* Count status */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${countOk ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
              {countOk ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${countOk ? "text-emerald-400" : "text-amber-400"}`}>
                  장면 {scenes.length}개 · 이미지 {mediaItems.length}개
                </span>
                {!countOk && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {diff > 0
                      ? `이미지가 ${diff}개 많습니다. 불필요한 이미지를 삭제하세요.`
                      : `이미지가 ${Math.abs(diff)}개 부족합니다. 미디어 관리에서 추가하세요.`}
                  </p>
                )}
              </div>
            </div>

            {/* Scene-Image mapping list */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">드래그하거나 ↑↓ 버튼으로 이미지 순서를 조정하세요</p>
              {scenes.map((scene, i) => {
                const item = mediaItems[i];
                const isDragOver = dragOverIdx === i;
                return (
                  <div
                    key={i}
                    draggable={!!item}
                    onDragStart={() => item && handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all
                      ${isDragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/40 bg-muted/30"}
                      ${dragIdx === i ? "opacity-40" : ""}`}
                  >
                    {/* Drag handle */}
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 cursor-grab hidden sm:block" />

                    {/* Scene info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">장면 {i + 1}</Badge>
                        <span className="text-xs font-medium truncate">{scene.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                          ~{((DURATION_SECONDS[project.duration ?? "short"] ?? 60) / Math.max(scenes.length, 1)).toFixed(1)}초
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{scene.content}</p>
                    </div>

                    {/* Slide/Image type toggle */}
                    {(() => {
                      // Default: image if mediaItem exists, slide if no media
                      const effectiveType = project.scenes?.[i]?.sceneType ?? (mediaItems[i] ? "image" : "slide");
                      return (
                        <button
                          onClick={() => {
                            const updated = [...(project.scenes ?? [])];
                            const cur = updated[i]?.sceneType ?? (mediaItems[i] ? "image" : "slide");
                            updated[i] = { ...updated[i], sceneType: cur === "slide" ? "image" : "slide" };
                            updateProject({ scenes: updated });
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-medium border shrink-0 transition-colors ${
                            effectiveType === "image"
                              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                              : "border-violet-500/40 bg-violet-500/10 text-violet-400"
                          }`}
                        >
                          {effectiveType === "image" ? "🖼 이미지" : "📋 슬라이드"}
                        </button>
                      );
                    })()}

                    {/* Assigned image */}
                    <div className={`rounded-lg overflow-hidden bg-muted shrink-0 border border-border/30 ${isShorts ? "w-10 h-[71px]" : "w-20 h-14"}`}>
                      {item ? (
                        item.type === "video" ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-5 h-5 text-muted-foreground" />
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.url} alt="" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>

                    {/* Up / Down / Delete buttons */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => moveItem(i, i - 1)}
                        disabled={i === 0 || !item}
                        className="w-7 h-7 rounded-md border border-border/50 flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveItem(i, i + 1)}
                        disabled={i >= mediaItems.length - 1 || !item}
                        className="w-7 h-7 rounded-md border border-border/50 flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Delete button */}
                    {item && (
                      <button
                        onClick={() => removeItem(i)}
                        className="w-7 h-7 rounded-md border border-border/50 flex items-center justify-center hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Extra images beyond scene count */}
            {diff > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-amber-400">미사용 이미지 ({diff}개)</span>
                  <span className="text-xs text-muted-foreground">영상에 포함되지 않습니다</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mediaItems.slice(scenes.length).map((item, i) => {
                    const realIdx = scenes.length + i;
                    return (
                      <div key={realIdx} className="relative group w-20 h-14 rounded-lg overflow-hidden bg-muted border border-amber-500/20">
                        {item.type === "video" ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-4 h-4 text-muted-foreground" />
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.url} alt="" className="w-full h-full object-cover" />
                        )}
                        <button
                          onClick={() => removeItem(realIdx)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-1">
          <Button variant="outline" onClick={onPrev} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={mediaItems.length === 0} className="gap-1.5 text-muted-foreground">
            <Save className="w-3.5 h-3.5" />
            {justSaved ? "저장됨 ✓" : "임시 저장"}
          </Button>
          <Button onClick={() => { updateProject({ imageUrls: mediaItems.map(m => m.url) }); onNext(); }} disabled={mediaItems.length === 0} className="gap-2">
            다음: 영상 렌더링
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
