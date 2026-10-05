import { AbsoluteFill, interpolate, useVideoConfig } from "remotion";
import { AudioTracks, BigWord, BrollBackground, Captions, HookCard, PayoffFlash, ProgressBar, SaveBadge, SaveIcon, usePunch } from "./shared";
import { sceneFor } from "./layout";
import type { ViralProps } from "./props";

const INK = "#0d0d0b";
const BONE = "#f3eee4";
const ACCENT = "#ff4d1a";
const HUES = ["#ff5a24", "#5b7cff", "#14d3b4", "#ffc21a", "#e24bff"];
const FONT = "'Bricolage Grotesque Variable', system-ui, sans-serif";
const EM = 0.6;

// Storytelling : texte cinétique plein écran. Chaque beat change de couleur, de côté et de mot géant.
export function ViralStory({ script, timeline, audio, broll }: ViralProps) {
  const { fps } = useVideoConfig();
  const { segment, index, punch, local, startFrame } = usePunch(timeline);
  const scene = sceneFor(script, timeline, index);
  const isPayoff = segment.kind === "payoff";
  const isCta = segment.kind === "cta";
  const hue = isPayoff ? ACCENT : HUES[scene.hue];
  const side = scene.variant === 1 ? -1 : 1;
  // Sur un vrai plan, la réponse reste claire et contourée ; sur l'aplat orange, elle passe en encre.
  const darkPayoff = isPayoff && !broll?.length;

  return (
    <AbsoluteFill style={{ backgroundColor: isPayoff ? ACCENT : INK, overflow: "hidden" }}>
      {broll?.length ? (
        <BrollBackground broll={broll} timeline={timeline} dim={0.62} tint={{ color: ACCENT, fromMs: timeline.segments.find((x) => x.kind === "payoff")?.startMs ?? Infinity }} />
      ) : (
        // BESOIN CREDIT: Higgsfield Soul + Seedance pour ces plans. Alternative gratuite: B-roll ComfyUI / Pexels, sinon ces fonds Remotion.
        <AbsoluteFill style={{ scale: `${1 + punch * 0.08}` }}>
          <div
            style={{
              position: "absolute",
              width: 1250,
              height: 1250,
              borderRadius: "50%",
              left: side > 0 ? -380 : 220,
              top: 160 + scene.variant * 210,
              background: `radial-gradient(circle, ${hue} 0%, transparent 64%)`,
              opacity: isPayoff ? 0 : 0.6,
              filter: "blur(30px)",
              translate: `${interpolate(local, [0, 3 * fps], [0, side * -90], { extrapolateRight: "clamp" })}px 0px`,
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 700,
              height: 700,
              borderRadius: "50%",
              right: side > 0 ? -260 : 520,
              bottom: 120,
              background: `radial-gradient(circle, ${HUES[(scene.hue + 2) % HUES.length]} 0%, transparent 62%)`,
              opacity: isPayoff ? 0 : 0.35,
              filter: "blur(40px)",
            }}
          />
        </AbsoluteFill>
      )}

      <HookCard timeline={timeline} fontFamily={FONT} color={BONE} accent={ACCENT} em={EM} />

      {!isCta && segment.kind !== "hook" ? (
        <BigWord
          word={scene.word}
          startFrame={startFrame}
          fontFamily={FONT}
          // Sur un vrai plan, le blanc contouré reste lisible ; la couleur du beat passe dans les sous-titres.
          color={darkPayoff ? INK : broll?.length ? BONE : hue}
          em={EM}
          tilt={side * (isPayoff ? 0 : 2)}
          stroke={!darkPayoff}
        />
      ) : null}

      {isCta ? <SaveIcon color={ACCENT} startFrame={startFrame} /> : null}

      <Captions timeline={timeline} fontFamily={FONT} color={darkPayoff ? INK : BONE} accent={darkPayoff ? BONE : hue} stroke={!darkPayoff} em={EM} />
      {isCta ? <SaveBadge accent={ACCENT} fontFamily={FONT} label={script.lang === "fr" ? "Garde ça" : "Save this"} /> : null}
      <PayoffFlash timeline={timeline} />
      <ProgressBar color={isPayoff ? INK : ACCENT} />
      <AudioTracks audio={audio} />
    </AbsoluteFill>
  );
}
