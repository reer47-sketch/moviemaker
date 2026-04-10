"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Film, Clock, CheckCircle, AlertCircle,
  Play, Download, Trash2, Zap, Loader2,
} from "lucide-react";

type Video = {
  id: string;
  topic: string;
  status: string;
  subtitled_video_url: string | null;
  video_url: string | null;
  image_urls: string[] | null;
  created_at: string;
};

const statusConfig: Record<string, { label: string; icon: any; badge: string }> = {
  completed: {
    label: "완료",
    icon: CheckCircle,
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  rendering: {
    label: "렌더링 중",
    icon: Clock,
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  failed: {
    label: "실패",
    icon: AlertCircle,
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
};

export default function DashboardPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVideos = async () => {
    try {
      const res = await fetch("/api/videos");
      const data = await res.json();
      setVideos(data.videos ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVideos(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("영상을 삭제하시겠습니까?")) return;
    await fetch("/api/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const handleDownload = async (url: string, topic: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${topic}.mp4`;
      a.click();
    } catch {
      window.open(url, "_blank");
    }
  };

  const completedCount = videos.filter((v) => v.status === "completed").length;

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
        <Link href="/create">
          <Button size="sm" className="gap-2">
            <Zap className="w-4 h-4" />
            새 영상 만들기
          </Button>
        </Link>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold mb-1">내 영상</h1>
            <p className="text-muted-foreground">AI로 만든 영상을 관리하세요</p>
          </div>
          <Link href="/create">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              새 영상
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { label: "전체 영상", value: String(videos.length), icon: Film, color: "text-violet-400" },
            { label: "완료된 영상", value: String(completedCount), icon: CheckCircle, color: "text-emerald-400" },
            { label: "절약한 편집 시간", value: `${completedCount * 3}시간+`, icon: Clock, color: "text-blue-400" },
          ].map((stat) => (
            <Card key={stat.label} className="bg-card border-border/50">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-muted">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Video List */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-border/50 rounded-2xl">
            <Film className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">아직 만든 영상이 없어요</h3>
            <p className="text-muted-foreground mb-6">AI로 첫 번째 영상을 만들어보세요</p>
            <Link href="/create">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                영상 만들기
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {videos.map((video) => {
              const cfg = statusConfig[video.status] ?? statusConfig.completed;
              const StatusIcon = cfg.icon;
              const finalUrl = video.subtitled_video_url ?? video.video_url;
              const thumb = video.image_urls?.[0];

              return (
                <Card key={video.id} className="bg-card border-border/50 hover:border-border transition-colors">
                  <CardContent className="p-5 flex items-center gap-5">
                    {/* Thumbnail */}
                    <div className="w-32 h-20 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={video.topic} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold truncate">{video.topic}</h3>
                        <Badge variant="outline" className={`text-xs shrink-0 ${cfg.badge}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {cfg.label}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(video.created_at).toLocaleDateString("ko-KR")}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {finalUrl && (
                        <>
                          <a href={finalUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" className="gap-2">
                              <Play className="w-4 h-4" />
                              재생
                            </Button>
                          </a>
                          <Button
                            variant="ghost" size="sm" className="gap-2"
                            onClick={() => handleDownload(finalUrl, video.topic)}
                          >
                            <Download className="w-4 h-4" />
                            다운로드
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost" size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(video.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
