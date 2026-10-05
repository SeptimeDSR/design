import { AbsoluteFill, Easing, interpolate, useVideoConfig } from "remotion";
import { AudioTracks, BrollBackground, Captions, ProgressBar, SaveBadge, emphasisOf, usePunch } from "./shared";
import type { ViralProps } from "./props";

const INK = "#0d0d0b";
const BONE = "#ece7dc";
const ACCENT = "#ff4d1a";
const HUES = ["#ff4d1a", "#3d5afe", "#00bfa6", "#ffb300", "#d500f9"];
const FONT = "'Bricolage Grotesque Variable', system-ui, sans-serif";

// Storytelling : texte cinétique plein écran. Chaque beat change de couleur, d'angle et de mot géant.
export function ViralStory({ script, timeline, audio, broll }: ViralProps) {
  const { fps } = useVideoConfig();
  const { segment, index, punch, local } = usePunch(timeline);
  const isPayoff = segment.kind === "payoff";
  const isCta = segment.kind === "cta";
  const hue = isPayoff ? ACCENT : HUES[index % HUES.length];
  const big = emphasisOf(segment.text, segment.kind === "beat" ? script.beats[index - 1]?.emphasis : undefined);
  const side = index % 2 === 0 ? 1 : -1;

  return (
    <AbsoluteFill style={{ backgroundColor: isPayoff ? ACCENT : INK, overflow: "hidden" }}>
      {/* BESOIN CREDIT: Higgsfield Soul + Seedance pour ces plans. Alternative gratuite: fonds procéduraux Remotion ci-dessous. */}
      {broll?.length ? (
        <BrollBackground broll={broll} timeline={timeline} />
      ) : (
        <AbsoluteFill style={{ scale: `${1 + punch * 0.08}` }}>
          <div
            style={{
              position: "absolute",
              width: 1100,
              height: 1100,
              borderRadius: "50%",
              left: side > 0 ? -300 : 280,
              top: 260 + (index % 3) * 180,
              background: `radial-gradient(circle, ${hue} 0%, transparent 65%)`,
              opacity: isPayoff ? 0 : 0.55,
              filter: "blur(40px)",
            }}
          />
        </AbsoluteFill>
      )}

      {!isCta ? (
        <AbsoluteFill style={{ top: "16%", height: "auto", alignItems: "center" }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: big.length > 9 ? 150 : 220,
              fontWeight: 800,
              letterSpacing: "-0.05em",
              lineHeight: 0.9,
              textAlign: "center",
              padding: "0 60px",
              color: "transparent",
              WebkitTextStroke: `4px ${isPayoff ? INK : BONE}`,
              rotate: `${side * (2 + punch * 6)}deg`,
              scale: `${interpolate(local, [0, 0.3 * fps], [1.25, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) })}`,
              opacity: interpolate(local, [0, 0.15 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            {big}
          </div>
        </AbsoluteFill>
      ) : null}

      <Captions timeline={timeline} fontFamily={FONT} color={isPayoff ? INK : BONE} accent={isPayoff ? BONE : hue} />
      {isCta ? <SaveBadge accent={ACCENT} fontFamily={FONT} label={script.lang === "fr" ? "Garde ça" : "Save this"} /> : null}
      <ProgressBar color={isPayoff ? INK : ACCENT} />
      <AudioTracks audio={audio} />
    </AbsoluteFill>
  );
}
