import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// FREE — /septim-design:cinematic-dolly en version code : faux travelling avant par parallaxe de calques.
// Équivalent PRO : Higgsfield (Cinema Studio / Seedance) ou Runway Gen-4.5 (crédits).
export const cinematicDollyConfig = { fps: 30, durationInFrames: 150, width: 1920, height: 1080 };

export type CinematicDollyProps = { title?: string };

const INK = "#0d0d0b";
const BONE = "#ece7dc";
const SIGNAL = "#ff4d1a";

export function CinematicDolly({ title = "Entrez dans la scène." }: CinematicDollyProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const push = interpolate(frame, [0, durationInFrames], [0, 1], { easing: Easing.bezier(0.45, 0, 0.2, 1) });

  // Plus un calque est "proche", plus il grossit vite : c'est ce qui vend le mouvement caméra.
  const layer = (depth: number) => ({ transform: `scale(${1 + push * depth})` });
  const titleOpacity = interpolate(frame, [20, 50, durationInFrames - 25, durationInFrames], [0, 1, 1, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: INK, overflow: "hidden" }}>
      <AbsoluteFill style={{ ...layer(0.15), opacity: 0.25 }}>
        <svg width="100%" height="100%" viewBox="0 0 1920 1080">
          {Array.from({ length: 25 }, (_, i) => (
            <line key={`v${i}`} x1={i * 80} y1={0} x2={i * 80} y2={1080} stroke={BONE} strokeWidth={1} />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 80} x2={1920} y2={i * 80} stroke={BONE} strokeWidth={1} />
          ))}
        </svg>
      </AbsoluteFill>

      <AbsoluteFill style={{ ...layer(0.35), alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 520, height: 520, borderRadius: "50%", background: SIGNAL, filter: "blur(60px)", opacity: 0.55 }} />
      </AbsoluteFill>

      <AbsoluteFill style={{ ...layer(0.45), alignItems: "center", justifyContent: "center" }}>
        <h1
          style={{
            margin: 0,
            opacity: titleOpacity,
            color: BONE,
            fontFamily: "'Bricolage Grotesque Variable', system-ui, sans-serif",
            fontSize: 120,
            fontWeight: 760,
            letterSpacing: "-0.04em",
          }}
        >
          {title}
        </h1>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.85) 100%)" }} />
    </AbsoluteFill>
  );
}
