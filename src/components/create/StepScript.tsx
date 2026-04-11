"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Loader2, ChevronRight, RefreshCw, FileText,
  Pencil, Check, Store, PawPrint, Package, PenLine, Save, Zap,
} from "lucide-react";
import type { VideoProject } from "@/app/create/page";
import { DURATION_OPTIONS } from "@/lib/introMusic";

type Props = {
  project: Partial<VideoProject>;
  updateProject: (data: Partial<VideoProject>) => void;
  onNext: () => void;
  onSave: () => void;
};

type FieldDef = { key: string; label: string; placeholder: string; multiline?: boolean };
type Template = {
  id: string;
  icon: React.ElementType;
  label: string;
  color: string;
  border: string;
  activeBg: string;
  fields: FieldDef[];
};

const TEMPLATES: Template[] = [
  {
    id: "store",
    icon: Store,
    label: "가게 홍보",
    color: "text-amber-400",
    border: "border-amber-500/20",
    activeBg: "bg-amber-500/10 border-amber-500/40",
    fields: [
      { key: "name",     label: "가게 이름",           placeholder: "예) 맛있는 한식당" },
      { key: "category", label: "업종 / 카테고리",      placeholder: "예) 한식 레스토랑, 카페, 미용실" },
      { key: "menu",     label: "주요 메뉴 / 서비스",   placeholder: "예) 비빔밥, 된장찌개, 삼겹살" },
      { key: "strength", label: "특징 / 강점",          placeholder: "예) 20년 전통, 국내산 재료만 사용" },
      { key: "location", label: "위치 / 영업시간",      placeholder: "예) 강남역 3번 출구, 11시~22시" },
      { key: "extra",    label: "추가로 홍보하고 싶은 말", placeholder: "예) 포장 및 배달 가능, 단체 예약 문의 환영", multiline: true },
    ],
  },
  {
    id: "pet",
    icon: PawPrint,
    label: "애완동물 소개",
    color: "text-rose-400",
    border: "border-rose-500/20",
    activeBg: "bg-rose-500/10 border-rose-500/40",
    fields: [
      { key: "species",     label: "동물 종류",            placeholder: "예) 골든 리트리버, 페르시안 고양이" },
      { key: "name",        label: "이름",                 placeholder: "예) 초코" },
      { key: "age",         label: "나이 / 외모 특징",     placeholder: "예) 2살, 갈색 털, 눈이 큼" },
      { key: "personality", label: "성격",                 placeholder: "예) 활발하고 애교가 많음" },
      { key: "hobby",       label: "좋아하는 것 / 특기",   placeholder: "예) 공 물어오기, 간식 먹기" },
      { key: "extra",       label: "추가로 전하고 싶은 말", placeholder: "예) 우리 집 막내이자 귀염둥이입니다!", multiline: true },
    ],
  },
  {
    id: "product",
    icon: Package,
    label: "제품 리뷰",
    color: "text-blue-400",
    border: "border-blue-500/20",
    activeBg: "bg-blue-500/10 border-blue-500/40",
    fields: [
      { key: "name",     label: "제품 이름 / 브랜드", placeholder: "예) 삼성 갤럭시 버즈2 프로" },
      { key: "category", label: "제품 종류",          placeholder: "예) 무선 이어폰, 스킨케어, 커피 메이커" },
      { key: "reason",   label: "구매 이유",          placeholder: "예) 출퇴근 음악 감상, 노이즈 캔슬링 필요" },
      { key: "pros",     label: "장점",               placeholder: "예) 음질 좋음, 착용감 편함, 배터리 오래 감" },
      { key: "cons",     label: "단점",               placeholder: "예) 가격이 높음, 케이스가 미끄러움" },
      { key: "target",   label: "추천 대상",          placeholder: "예) 음악 마니아, 재택근무자" },
      { key: "extra",    label: "추가 한마디",        placeholder: "예) 이 가격에 이 퀄리티면 강추합니다!", multiline: true },
    ],
  },
];

type Scene = { title: string; content: string };

function buildPrompt(template: Template, fields: Record<string, string>): string {
  const lines = template.fields
    .filter((f) => fields[f.key]?.trim())
    .map((f) => `${f.label}: ${fields[f.key].trim()}`);
  if (!lines.length) return `${template.label} 영상`;
  return `${template.label} 영상\n\n${lines.join("\n")}`;
}

function buildTopic(template: Template | null, fields: Record<string, string>, freeTopic: string): string {
  if (!template) return freeTopic;
  const name = fields["name"]?.trim();
  return name ? `${template.label} — ${name}` : template.label;
}

export function StepScript({ project, updateProject, onNext, onSave }: Props) {
  const [justSaved, setJustSaved] = useState(false);
  const handleSave = () => { onSave(); setJustSaved(true); setTimeout(() => setJustSaved(false), 2000); };

  const [duration, setDuration] = useState(project.duration ?? "short");
  const [language, setLanguage] = useState(project.language ?? "ko");
  const [characterDescription, setCharacterDescription] = useState(project.characterDescription ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [freeTopic, setFreeTopic] = useState(project.topic ?? "");
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState(project.script ?? "");
  const [scenes, setScenes] = useState<Scene[]>(project.scenes ?? []);
  const [keyPhrase, setKeyPhrase] = useState(project.keyPhrase ?? "");
  const [scriptError, setScriptError] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editBuf, setEditBuf] = useState<Scene>({ title: "", content: "" });

  const selectedTemplate = TEMPLATES.find((t) => t.id === selectedId) ?? null;
  const setField = (key: string, value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  const canGenerate = selectedTemplate
    ? selectedTemplate.fields.some((f) => fields[f.key]?.trim())
    : freeTopic.trim().length > 0;

  const generateScript = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setEditingIdx(null);
    const prompt = selectedTemplate ? buildPrompt(selectedTemplate, fields) : freeTopic;
    const topic = buildTopic(selectedTemplate, fields, freeTopic);
    try {
      const res = await fetch("/api/generate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: prompt, duration, characterDescription, language }),
      });
      const data = await res.json();
      if (!res.ok || !data.scenes) {
        setScriptError(data.error ?? "스크립트 생성에 실패했습니다");
        return;
      }
      setScriptError("");
      setScript(data.script);
      setScenes(data.scenes);
      setKeyPhrase(data.keyPhrase ?? "");
      updateProject({ topic, script: data.script, scenes: data.scenes, keyPhrase: data.keyPhrase ?? "", duration, characterDescription, language });
    } catch (e) {
      console.error(e);
      setScriptError("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (i: number) => { setEditingIdx(i); setEditBuf({ ...scenes[i] }); };
  const saveEdit = (i: number) => {
    const updated = scenes.map((s, idx) => (idx === i ? editBuf : s));
    const newScript = updated.map((s) => s.content).join(" ");
    setScenes(updated);
    setScript(newScript);
    updateProject({ scenes: updated, script: newScript });
    setEditingIdx(null);
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

        {/* Language selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0">언어</label>
          <div className="flex rounded-lg border border-border/50 overflow-hidden text-sm">
            {[{ id: "ko", label: "한국어" }, { id: "en", label: "English" }].map((lang) => (
              <button
                key={lang.id}
                onClick={() => setLanguage(lang.id)}
                className={`px-4 py-1.5 transition-colors ${
                  language === lang.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Character description */}
        <div className="space-y-2">
          <label className="text-sm font-medium">고정 캐릭터 설명 <span className="text-xs text-muted-foreground font-normal">(선택사항 — 모든 이미지에 적용)</span></label>
          <input
            type="text"
            value={characterDescription}
            onChange={(e) => setCharacterDescription(e.target.value)}
            placeholder="예) a friendly cartoon character with round glasses and orange hoodie"
            className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
          />
        </div>

        {/* Duration selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">영상 길이</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {DURATION_OPTIONS.map((d) => {
              const active = duration === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDuration(d.id)}
                  className={`p-2.5 rounded-xl border text-center transition-all
                    ${active
                      ? "bg-primary/10 border-primary/50 text-primary"
                      : "bg-muted/30 border-border/40 text-muted-foreground hover:border-border hover:text-foreground"}`}
                >
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    {d.id === "short" && <Zap className="w-3 h-3" />}
                    <span className="text-sm font-bold">{d.label}</span>
                  </div>
                  <div className="text-xs opacity-70">{d.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Template buttons */}
        <div className="space-y-2">
          <label className="text-sm font-medium">빠른 템플릿</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TEMPLATES.map((t) => {
              const active = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setSelectedId(active ? null : t.id); setFields({}); }}
                  className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02]
                    ${active ? t.activeBg : `bg-muted/30 ${t.border} hover:bg-muted/50`}`}
                >
                  <t.icon className={`w-4 h-4 mb-1.5 ${t.color}`} />
                  <div className={`text-xs font-semibold ${active ? t.color : "text-foreground"}`}>{t.label}</div>
                </button>
              );
            })}
            <button
              onClick={() => { setSelectedId(null); setFields({}); }}
              className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02]
                ${!selectedId ? "bg-primary/10 border-primary/40" : "bg-muted/30 border-border/30 hover:bg-muted/50"}`}
            >
              <PenLine className={`w-4 h-4 mb-1.5 ${!selectedId ? "text-primary" : "text-muted-foreground"}`} />
              <div className={`text-xs font-semibold ${!selectedId ? "text-primary" : "text-muted-foreground"}`}>직접 입력</div>
            </button>
          </div>
        </div>

        {/* Template fields */}
        {selectedTemplate ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <selectedTemplate.icon className={`w-4 h-4 ${selectedTemplate.color}`} />
              <span className="text-sm font-medium">{selectedTemplate.label} 정보 입력</span>
              <span className="text-xs text-muted-foreground ml-1">비워두면 해당 항목은 생략됩니다</span>
            </div>
            <div className="space-y-2.5">
              {selectedTemplate.fields.map((f) =>
                f.multiline ? (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                    <textarea
                      rows={2}
                      value={fields[f.key] ?? ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all resize-none leading-relaxed"
                    />
                  </div>
                ) : (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                    <input
                      type="text"
                      value={fields[f.key] ?? ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && generateScript()}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                    />
                  </div>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium">영상 주제</label>
            <input
              type="text"
              value={freeTopic}
              onChange={(e) => setFreeTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generateScript()}
              placeholder="원하는 영상 주제를 자유롭게 입력하세요..."
              className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
          </div>
        )}

        {scriptError && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
            {scriptError}
          </div>
        )}

        {/* Generate button */}
        <Button onClick={generateScript} disabled={!canGenerate || loading} className="w-full gap-2 h-11">
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> 스크립트 생성 중...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> {script ? "스크립트 재생성" : "스크립트 생성하기"}</>
          )}
        </Button>

        {/* Key phrase highlight */}
        {keyPhrase && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5">
            <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-primary mb-0.5">핵심 문구 (인트로 오버레이)</div>
              <div className="text-sm font-semibold truncate">{keyPhrase}</div>
            </div>
          </div>
        )}

        {/* Script result */}
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

        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={!script} className="gap-1.5 text-muted-foreground">
            <Save className="w-3.5 h-3.5" />
            {justSaved ? "저장됨 ✓" : "임시 저장"}
          </Button>
          <Button
            onClick={() => {
              updateProject({
                topic: buildTopic(selectedTemplate, fields, freeTopic),
                script, scenes, keyPhrase, duration, characterDescription,
              });
              onNext();
            }}
            disabled={!script}
            className="gap-2"
          >
            다음: 음성 생성
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
