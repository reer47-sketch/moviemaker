import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Scene = {
  title: string;
  content: string;
  imageUrl: string;
  startFrame: number;
  durationFrames: number;
};

type Props = {
  scenes: Scene[];
  audioUrl: string;
};

function SceneSlide({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 25], [30, 0], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.05]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14" }}>
      {/* Background image with Ken Burns effect */}
      <AbsoluteFill style={{ opacity: 0.7, transform: `scale(${scale})`, overflow: "hidden" }}>
        <Img
          src={scene.imageUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* Dark gradient overlay */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.1) 100%)",
        }}
      />

      {/* Text content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "60px",
          opacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#ffffff",
            marginBottom: 16,
            fontFamily: "sans-serif",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}
        >
          {scene.title}
        </div>
        <div
          style={{
            fontSize: 20,
            color: "rgba(255,255,255,0.85)",
            lineHeight: 1.6,
            fontFamily: "sans-serif",
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            maxWidth: "80%",
          }}
        >
          {scene.content}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function VideoComposition({ scenes, audioUrl }: Props) {
  return (
    <AbsoluteFill>
      {audioUrl && <Audio src={audioUrl} />}
      {scenes.map((scene, i) => (
        <Sequence
          key={i}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
        >
          <SceneSlide scene={scene} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
