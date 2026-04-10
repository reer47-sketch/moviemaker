"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ImageIcon, Loader2, ChevronRight, ChevronLeft,
  RefreshCw, Upload, X, Plus, Film, Sparkles,
} from "lucide-react";
import type { VideoProject } from "@/app/create/page";

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
  onPrev: () => void;
};

type MediaItem = { url: string; type: "image" | "video"; name?: string };

export function StepImages({ project, updateProject, onNext, onPrev }: Props) {
  const [loading, setLoading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>(project.imageUrls ?? []);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(
    (project.imageUrls ?? []).map((url) => ({ url, type: "image" as const }))
  );
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncUrls = (items: MediaItem[]) => {
    const urls = items.map((m) => m.url);
    setImageUrls(urls);
    updateProject({ imageUrls: urls });
  };

  const generateImages = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/generate/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes: project.scenes }),
      });
      const data = await res.json();
      const items: MediaItem[] = data.imageUrls.map((url: string) => ({ url, type: "image" as const }));
      setMediaItems(items);
      syncUrls(items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const regenerateImage = async (idx: number) => {
    setRegeneratingIdx(idx);
    try {
      const res = await fetch("/api/generate/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes: [project.scenes?.[idx]], single: true }),
      });
      const data = await res.json();
      const updated = [...mediaItems];
      updated[idx] = { url: data.imageUrls[0], type: "image" };
      setMediaItems(updated);
      syncUrls(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const handleFileUpload = async (files: FileList) => {
    setUploading(true);
    const newItems: MediaItem[] = [];
    try {
      for (const file of Array.from(files)) {
        // 1. Get a signed upload URL from server (tiny request, no file data)
        const signedRes = await fetch("/api/upload/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        });
        const { signedUrl, publicUrl } = await signedRes.json();
        if (!signedUrl) continue;

        // 2. Upload file directly to Supabase from browser (bypasses Vercel 4MB limit)
        await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        newItems.push({
          url: publicUrl,
          type: file.type.startsWith("video/") ? "video" : "image",
          name: file.name,
        });
      }
      const updated = [...mediaItems, ...newItems];
      setMediaItems(updated);
      syncUrls(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const removeItem = (idx: number) => {
    const updated = mediaItems.filter((_, i) => i !== idx);
    setMediaItems(updated);
    syncUrls(updated);
  };

  const handleNext = () => {
    updateProject({ imageUrls });
    onNext();
  };

  const scenes = project.scenes ?? [];

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

        <Tabs defaultValue="ai">
          <TabsList className="w-full">
            <TabsTrigger value="ai" className="flex-1">AI 자동 생성</TabsTrigger>
            <TabsTrigger value="upload" className="flex-1">직접 업로드</TabsTrigger>
          </TabsList>

          {/* AI Generation tab */}
          <TabsContent value="ai" className="space-y-4 pt-2">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/30">
              <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                총 <span className="text-foreground font-medium">{scenes.length}개</span> 장면에 대한 이미지가 생성됩니다
              </span>
            </div>
            <Button
              onClick={generateImages}
              disabled={loading || scenes.length === 0}
              className="w-full gap-2 h-11"
              variant={mediaItems.filter(m => m.type === "image" && !m.name).length > 0 ? "outline" : "default"}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 생성 중 ({scenes.length}개)...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> AI 이미지 생성하기</>
              )}
            </Button>
          </TabsContent>

          {/* Upload tab */}
          <TabsContent value="upload" className="space-y-4 pt-2">
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
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">미디어 목록</span>
              <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                {mediaItems.length}개
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
              {mediaItems.map((item, i) => (
                <div key={i} className="relative group aspect-video rounded-xl overflow-hidden bg-muted">
                  {item.type === "video" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-muted">
                      <Film className="w-6 h-6 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground truncate px-2 max-w-full">{item.name}</span>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={`Media ${i + 1}`} className="w-full h-full object-cover" />
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {item.type === "image" && !item.name && (
                      <Button
                        size="sm" variant="secondary" className="gap-1 h-7 text-xs"
                        onClick={() => regenerateImage(i)}
                        disabled={regeneratingIdx === i}
                      >
                        {regeneratingIdx === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        재생성
                      </Button>
                    )}
                    <Button
                      size="sm" variant="destructive" className="h-7 w-7 p-0"
                      onClick={() => removeItem(i)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Badge */}
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

              {/* Add more button */}
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

        {/* Navigation */}
        <div className="flex justify-between pt-1">
          <Button variant="outline" onClick={onPrev} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <Button onClick={handleNext} disabled={mediaItems.length === 0} className="gap-2">
            다음: 영상 렌더링
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
