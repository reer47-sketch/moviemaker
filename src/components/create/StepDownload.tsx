"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  CheckCircle,
  Share2,
  LayoutDashboard,
  Plus,
  Film,
  ExternalLink,
} from "lucide-react";
import type { VideoProject } from "@/app/create/page";

type Props = {
  project: Partial<VideoProject>;
};

export function StepDownload({ project }: Props) {
  const finalUrl = project.subtitledVideoUrl ?? project.videoUrl ?? "";

  const handleDownload = async () => {
    if (!finalUrl) return;
    try {
      // Fetch the video as a blob to force download
      const res = await fetch(finalUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `moviemaker-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      // Fallback: open in new tab
      window.open(finalUrl, "_blank");
    }
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <Download className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <div className="text-lg">영상 완성!</div>
            <div className="text-sm font-normal text-muted-foreground mt-0.5">
              AI가 만든 영상이 완성되었습니다
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Success banner */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/10 to-rose-500/10 border border-primary/20 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-bold text-xl mb-1">영상 제작 완료!</h3>
          <p className="text-muted-foreground text-sm">
            스크립트 → 음성 → 이미지 → 렌더링 → 자막까지 모두 완성됐습니다
          </p>
        </div>

        {/* Video Preview */}
        {finalUrl ? (
          <div className="aspect-video rounded-xl overflow-hidden bg-muted">
            <video src={finalUrl} controls className="w-full h-full" preload="metadata" />
          </div>
        ) : (
          <div className="aspect-video rounded-xl bg-muted flex items-center justify-center">
            <Film className="w-10 h-10 text-muted-foreground" />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: "장면 수", value: `${project.scenes?.length ?? 0}개` },
            { label: "이미지", value: `${project.imageUrls?.length ?? 0}개` },
            { label: "자막", value: "포함" },
          ].map((stat) => (
            <div key={stat.label} className="p-3 rounded-xl bg-muted/50 border border-border/30">
              <div className="text-lg font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handleDownload}
            disabled={!finalUrl}
            className="w-full gap-2 h-11"
          >
            <Download className="w-4 h-4" />
            영상 다운로드
          </Button>

          {/* Direct link fallback */}
          {finalUrl && (
            <a href={finalUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full gap-2 text-muted-foreground">
                <ExternalLink className="w-4 h-4" />
                새 탭에서 열기 (다운로드 안 될 때)
              </Button>
            </a>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="gap-2"
              disabled={!finalUrl}
              onClick={() => {
                navigator.clipboard.writeText(finalUrl).catch(() => {});
              }}
            >
              <Share2 className="w-4 h-4" />
              링크 복사
            </Button>
            <Link href="/create" className="block">
              <Button variant="outline" className="w-full gap-2">
                <Plus className="w-4 h-4" />
                새 영상 만들기
              </Button>
            </Link>
          </div>

          <Link href="/dashboard" className="block">
            <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
              <LayoutDashboard className="w-4 h-4" />
              대시보드로 이동
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
