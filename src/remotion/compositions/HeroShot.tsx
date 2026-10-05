import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// FREE — /hero-shot en version code. Équivalent PRO : Higgsfield Soul + Seedance (crédits).
export const heroShotConfig = { fps: 30, durationInFrames: 180, width: 1920, height: 1080 };

export type HeroShotProps = { title?: string; tagline?: string };

const INK = "#0d0d0b";
const BONE = "#ece7dc";
const SIGNAL = "#ff4d1a";

export function HeroShot({ title = "Le scroll qui retient.", tagline = "Septim — studio de sites" }: HeroShotProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const orbScale = interpolate(frame, [0, durationInFrames], [0.7, 1.35]);
  const orbGlow = 0.55 + 0.15 * Math.sin(frame / 12);
  const sweep = interpolate(frame, [40, 110], [-40, 140], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const taglineIn = spring({ frame: frame - 95, fps, config: { damping: 200 } });
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: INK, opacity: fadeOut, overflow: "hidden" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 900,
            height: 900,
            borderRadius: "50%",
            transform: `scale(${orbScale})`,
            background: `radial-gradient(circle at 35% 30%, ${SIGNAL} 0%, #7a1f08 38%, ${INK} 70%)`,
            opacity: orbGlow,
            filter: "blur(30px)",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "center", padding: "0 140px" }}>
        <h1
          style={{
            margin: 0,
            color: BONE,
            fontFamily: "'Bricolage Grotesque Variable', system-ui, sans-serif",
            fontSize: 168,
            fontWeight: 760,
            lineHeight: 0.92,
            letterSpacing: "-0.04em",
            display: "flex",
            flexWrap: "wrap",
            columnGap: "0.25em",
            maskImage: `linear-gradient(100deg, #000 ${sweep - 30}%, rgba(0,0,0,0.35) ${sweep}%, #000 ${sweep + 30}%)`,
          }}
        >
          {title.split(" ").map((word, i) => {
            const p = spring({ frame: frame - 8 - i * 7, fps, config: { damping: 14, mass: 0.8 } });
            return (
              <span key={i} style={{ display: "inline-block", overflow: "hidden" }}>
                <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%)` }}>{word}</span>
              </span>
            );
          })}
        </h1>
        <p
          style={{
            marginTop: 48,
            color: BONE,
            opacity: taglineIn * 0.7,
            transform: `translateY(${(1 - taglineIn) * 20}px)`,
            fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
            fontSize: 34,
          }}
        >
          {tagline}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
