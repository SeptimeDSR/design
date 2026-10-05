import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AudioTracks, Captions, ProgressBar, SaveBadge, usePunch } from "./shared";
import { msToFrame, type ViralProps } from "./props";

const NIGHT = "#07080a";
const SILVER = "#f1ece2";
const AMBER = "#ffb347";
const SERIF = "'Instrument Serif', Georgia, serif";
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];

// Film : cinémascope, grain, un travelling avant par plan, un numéro de chapitre à chaque coupe.
export function ViralFilm({ script, timeline, audio, broll }: ViralProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { segment, index, local } = usePunch(timeline);
  const shotFrames = Math.max(1, msToFrame(segment.endMs - segment.startMs, fps));
  const push = interpolate(local, [0, shotFrames], [1, 1.12], { extrapolateRight: "clamp" });
  const isPayoff = segment.kind === "payoff";

  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT, overflow: "hidden" }}>
      {/* BESOIN CREDIT: Higgsfield Cinema Studio / Seedance pour de vrais plans de film. Alternative gratuite: décor en parallaxe Remotion. */}
      {broll?.length ? null : (
        <>
          <AbsoluteFill style={{ scale: `${push}`, background: `radial-gradient(ellipse at ${30 + (index % 3) * 20}% 40%, ${isPayoff ? AMBER : "#1d2a3a"} 0%, ${NIGHT} 70%)` }} />
          <AbsoluteFill style={{ scale: `${1 + (push - 1) * 2.2}`, opacity: 0.35 }}>
            <div style={{ position: "absolute", left: "-10%", right: "-10%", top: "62%", height: 380, background: "linear-gradient(transparent, rgba(255,179,71,0.25), transparent)", rotate: `${-8 + index * 3}deg` }} />
          </AbsoluteFill>
        </>
      )}

      <AbsoluteFill style={{ top: 330, height: "auto", alignItems: "center" }}>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 64,
            letterSpacing: "0.3em",
            color: AMBER,
            opacity: interpolate(local, [0, 0.2 * fps, 0.9 * fps, 1.2 * fps], [0, 1, 1, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {segment.kind === "hook" ? (script.lang === "fr" ? "PROLOGUE" : "PROLOGUE") : isPayoff ? (script.lang === "fr" ? "LA RÉPONSE" : "THE ANSWER") : ROMAN[index % ROMAN.length]}
        </div>
      </AbsoluteFill>

      <Captions timeline={timeline} fontFamily={SERIF} color={SILVER} accent={AMBER} top="48%" fontSize={104} />
      {segment.kind === "cta" ? <SaveBadge accent={AMBER} fontFamily={SERIF} label={script.lang === "fr" ? "Garde ça" : "Save this"} /> : null}

      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 30} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: "url(#grain)", opacity: 0.12, mixBlendMode: "overlay" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.75) 100%)" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 210, background: "#000" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 210, background: "#000" }} />
      <ProgressBar color={AMBER} track="rgba(241,236,226,0.15)" />
      <AudioTracks audio={audio} />
    </AbsoluteFill>
  );
}
