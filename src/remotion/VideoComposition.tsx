import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type SceneType = "image" | "slide";

export type Scene = {
  title: string;
  content: string;
  imageUrl?: string;
  sceneType?: SceneType;
  startFrame: number;
  durationFrames: number;
};

type Props = {
  scenes: Scene[];
  audioUrl: string;
};

/* ── 이미지 슬라이드 (Ken Burns) ── */
function ImageSlide({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 25], [30, 0], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.05]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14" }}>
      <AbsoluteFill style={{ opacity: 0.7, transform: `scale(${scale})`, overflow: "hidden" }}>
        <Img src={scene.imageUrl!} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)" }} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 60, opacity, transform: `translateY(${titleY}px)` }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", marginBottom: 16, fontFamily: "sans-serif", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
          {scene.title}
        </div>
        <div style={{ fontSize: 26, color: "rgba(255,255,255,0.88)", lineHeight: 1.6, fontFamily: "sans-serif", textShadow: "0 1px 4px rgba(0,0,0,0.8)", maxWidth: "75%" }}>
          {scene.content}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* ── 프레젠테이션 슬라이드 ── */
function PresentationSlide({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const titleX = interpolate(frame, [0, 18], [-40, 0], { extrapolateRight: "clamp" });
  const contentOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: "clamp" });
  const contentY = interpolate(frame, [15, 35], [20, 0], { extrapolateRight: "clamp" });
  const lineWidth = interpolate(frame, [10, 30], [0, 120], { extrapolateRight: "clamp" });

  // Split content into bullet points if it contains line breaks or sentences
  const bullets = scene.content
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4)
    .slice(0, 4);

  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 120px" }}>
      {/* Accent bar */}
      <div style={{ width: lineWidth, height: 6, backgroundColor: "#4f46e5", borderRadius: 3, marginBottom: 32 }} />

      {/* Title */}
      <div style={{
        fontSize: 64,
        fontWeight: 800,
        color: "#111827",
        fontFamily: "sans-serif",
        lineHeight: 1.2,
        marginBottom: 40,
        opacity: titleOpacity,
        transform: `translateX(${titleX}px)`,
      }}>
        {scene.title}
      </div>

      {/* Content */}
      <div style={{ opacity: contentOpacity, transform: `translateY(${contentY}px)` }}>
        {bullets.length > 1 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {bullets.map((bullet, i) => {
              const bulletOpacity = interpolate(frame, [20 + i * 8, 35 + i * 8], [0, 1], { extrapolateRight: "clamp" });
              const bulletX = interpolate(frame, [20 + i * 8, 35 + i * 8], [20, 0], { extrapolateRight: "clamp" });
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 20, opacity: bulletOpacity, transform: `translateX(${bulletX}px)` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#4f46e5", marginTop: 14, flexShrink: 0 }} />
                  <div style={{ fontSize: 32, color: "#374151", fontFamily: "sans-serif", lineHeight: 1.5 }}>{bullet}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 34, color: "#374151", fontFamily: "sans-serif", lineHeight: 1.7 }}>{scene.content}</div>
        )}
      </div>
    </AbsoluteFill>
  );
}

export function VideoComposition({ scenes, audioUrl }: Props) {
  return (
    <AbsoluteFill>
      {audioUrl && <Audio src={audioUrl} />}
      {scenes.map((scene, i) => (
        <Sequence key={i} from={scene.startFrame} durationInFrames={scene.durationFrames}>
          {scene.sceneType === "image" && scene.imageUrl
            ? <ImageSlide scene={scene} />
            : <PresentationSlide scene={scene} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
