import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Mic,
  ImageIcon,
  Film,
  Captions,
  Download,
  ArrowRight,
  Play,
  Zap,
} from "lucide-react";

const steps = [
  {
    icon: Sparkles,
    step: "01",
    title: "스크립트 생성",
    desc: "주제만 입력하면 Claude AI가 완성도 높은 대본을 자동으로 작성합니다",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
  },
  {
    icon: Mic,
    step: "02",
    title: "음성 생성",
    desc: "ElevenLabs AI가 자연스러운 한국어 나레이션 음성을 만들어드립니다",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    icon: ImageIcon,
    step: "03",
    title: "이미지 생성",
    desc: "DALL-E 3가 스크립트에 맞는 고품질 B-roll 이미지를 자동 생성합니다",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
  },
  {
    icon: Film,
    step: "04",
    title: "영상 렌더링",
    desc: "슬라이드와 이미지, 음성을 조합해 완성된 영상으로 렌더링합니다",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    icon: Captions,
    step: "05",
    title: "자막 삽입",
    desc: "Whisper AI가 음성을 분석해 정확한 자막을 자동으로 삽입합니다",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  {
    icon: Download,
    step: "06",
    title: "다운로드",
    desc: "완성된 영상을 HD 품질로 다운로드하거나 바로 공유하세요",
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border/50 px-6 py-4 flex items-center justify-between backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Film className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">MovieMaker</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">대시보드</Button>
          </Link>
          <Link href="/create">
            <Button size="sm" className="gap-2">
              <Zap className="w-4 h-4" />
              영상 만들기
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-6 py-32 text-center overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] rounded-full bg-violet-500/5 blur-3xl" />
        </div>

        <Badge variant="outline" className="mb-6 gap-2 border-primary/30 text-primary px-4 py-1">
          <Sparkles className="w-3 h-3" />
          AI 기반 영상 자동 제작
        </Badge>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl mx-auto">
          아이디어만 있으면
          <br />
          <span className="text-primary">영상이 완성됩니다</span>
        </h1>

        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          주제를 입력하면 AI가 스크립트, 음성, 이미지, 자막까지
          <br />
          모두 자동으로 만들어 완성된 영상을 제공합니다
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/create">
            <Button size="lg" className="gap-2 h-12 px-8 text-base">
              <Play className="w-5 h-5" />
              무료로 시작하기
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" size="lg" className="h-12 px-8 text-base border-border/50">
              내 영상 보기
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          신용카드 불필요 · 5~10분 내 완성 · HD 품질 다운로드
        </p>
      </section>

      {/* Steps */}
      <section className="px-6 py-24 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">6단계로 완성되는 영상</h2>
          <p className="text-muted-foreground text-lg">클릭 몇 번으로 전문적인 영상을 만드세요</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.map(({ icon: Icon, step, title, desc, color, bg }) => (
            <div
              key={step}
              className={`relative p-6 rounded-2xl border ${bg} transition-all duration-300 hover:scale-[1.02]`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2.5 rounded-xl ${bg} border`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-xs font-mono font-bold mb-1 ${color}`}>STEP {step}</div>
                  <h3 className="font-semibold text-lg mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <div className="max-w-2xl mx-auto bg-card border border-border/50 rounded-3xl p-12">
          <h2 className="text-3xl font-bold mb-4">지금 바로 시작하세요</h2>
          <p className="text-muted-foreground mb-8">
            복잡한 편집 없이, AI가 모든 것을 처리합니다
          </p>
          <Link href="/create">
            <Button size="lg" className="gap-2 h-12 px-8 text-base">
              <Sparkles className="w-5 h-5" />
              첫 영상 만들기
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-8 text-center text-sm text-muted-foreground">
        <p>© 2025 MovieMaker. AI 영상 제작 스튜디오</p>
      </footer>
    </main>
  );
}
