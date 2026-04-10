"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Loader2, ChevronRight, RefreshCw, FileText,
  Pencil, Check, Store, PawPrint, Package,
} from "lucide-react";
import type { VideoProject } from "@/app/create/page";

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
};

const TEMPLATES = [
  {
    icon: Store,
    label: "가게 홍보",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    prompt: "우리 가게를 홍보하는 영상 — 가게 이름, 메뉴/상품, 분위기, 오시는 길을 소개하는 내용",
  },
  {
    icon: PawPrint,
    label: "애완동물 소개",
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    prompt: "내가 키우는 애완동물을 소개하는 영상 — 동물 종류, 이름, 성격, 일상, 키우는 팁",
  },
  {
    icon: Package,
    label: "제품 리뷰",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    prompt: "내가 사용한 제품을 리뷰하는 영상 — 제품 소개, 장단점, 사용 후기, 추천 대상",
  },
];

type Scene = { title: string; content: string };

export function StepScript({ project, updateProject, onNext }: Props) {
  const [topic, setTopic] = useState(project.topic ?? "");
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState(project.script ?? "");
  const [scenes, setScenes] = useState<Scene[]>(project.scenes ?? []);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editBuf, setEditBuf] = useState<Scene>({ title: "", content: "" });

  const generateScript = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setEditingIdx(null);
    try {
      const res = await fetch("/api/generate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      setScript(data.script);
      setScenes(data.scenes);
      updateProject({ topic, script: data.script, scenes: data.scenes });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditBuf({ ...scenes[i] });
  };

  const saveEdit = (i: number) => {
    const updated = scenes.map((s, idx) => (idx === i ? editBuf : s));
    const newScript = updated.map((s) => s.content).join(" ");
    setScenes(updated);
    setScript(newScript);
    updateProject({ scenes: updated, script: newScript });
    setEditingIdx(null);
  };

  const handleNext = () => {
    updateProject({ topic, script, scenes });
    onNext();
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <div className="text-lg">스크립트 생성</div>
            <div className="text-sm font-normal text-muted-foreground mt-0.5">
              Claude AI가 주제에 맞는 영상 대본을 작성합니다
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Templates */}
        <div className="space-y-2">
          <label className="text-sm font-medium">빠른 템플릿</label>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => setTopic(t.prompt)}
                className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02] ${t.bg}`}
              >
                <t.icon className={`w-4 h-4 mb-1.5 ${t.color}`} />
                <div className={`text-xs font-semibold ${t.color}`}>{t.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Topic Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">영상 주제</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generateScript()}
              placeholder="템플릿을 선택하거나 직접 입력하세요..."
              className="flex-1 px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
            <Button onClick={generateScript} disabled={!topic.trim() || loading} className="gap-2 px-5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "생성 중..." : "생성"}
            </Button>
          </div>
        </div>

        {/* Script Result */}
        {scenes.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">생성된 스크립트</span>
                <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-400 border-violet-500/20">
                  {scenes.length}개 장면
                </Badge>
              </div>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={generateScript} disabled={loading}>
                <RefreshCw className="w-3.5 h-3.5" />
                재생성
              </Button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {scenes.map((scene, i) => (
                <div key={i} className="p-4 rounded-xl bg-muted/50 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-violet-400">SCENE {i + 1}</span>
                    {editingIdx === i ? (
                      <Button size="sm" variant="ghost" className="h-6 px-2 gap-1 text-emerald-400" onClick={() => saveEdit(i)}>
                        <Check className="w-3 h-3" /> 저장
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-6 px-2 gap-1 text-muted-foreground" onClick={() => startEdit(i)}>
                        <Pencil className="w-3 h-3" /> 편집
                      </Button>
                    )}
                  </div>

                  {editingIdx === i ? (
                    <div className="space-y-2">
                      <input
                        value={editBuf.title}
                        onChange={(e) => setEditBuf((b) => ({ ...b, title: e.target.value }))}
                        className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <textarea
                        value={editBuf.content}
                        onChange={(e) => setEditBuf((b) => ({ ...b, content: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 leading-relaxed"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-semibold mb-1">{scene.title}</div>
                      <div className="text-sm text-muted-foreground leading-relaxed">{scene.content}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button onClick={handleNext} disabled={!script} className="gap-2">
            다음: 음성 생성
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
