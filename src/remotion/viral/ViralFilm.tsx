import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AudioTracks, BigWord, BrollBackground, Captions, HookCard, PayoffFlash, ProgressBar, SaveBadge, usePunch } from "./shared";
import { LAYOUT, chapterLabel, sceneFor } from "./layout";
import { msToFrame, type ViralProps } from "./props";

const NIGHT = "#07080a";
const SILVER = "#f4efe5";
const AMBER = "#ffb347";
const SERIF = "'Instrument Serif', Georgia, serif";
// Instrument Serif est étroite : chasse moyenne ~0,40 em.
const EM = 0.4;

// Film : plein cadre, grain, un travelling avant par plan, un chapitre géant à chaque coupe.
export function ViralFilm({ script, timeline, audio, broll }: ViralProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { segment, index, local, startFrame } = usePunch(timeline);
  const scene = sceneFor(script, timeline, index);
  const shotFrames = Math.max(1, msToFrame(segment.endMs - segment.startMs, fps));
  const push = interpolate(local, [0, shotFrames], [1, 1.12], { extrapolateRight: "clamp" });
  const isPayoff = segment.kind === "payoff";
  const darkPayoff = isPayoff && !broll?.length;
  const label = chapterLabel(timeline, index, script.lang);
  const roman = segment.kind === "beat";
  const chapter = LAYOUT.chapter;

  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT, overflow: "hidden" }}>
      {/* BESOIN CREDIT: Higgsfield Cinema Studio / Seedance pour de vrais plans de film. Alternative gratuite: B-roll ComfyUI (Wan 2.2) / Pexels, sinon ce décor en parallaxe Remotion. */}
      {broll?.length ? (
        <BrollBackground broll={broll} timeline={timeline} dim={0.55} tint={{ color: AMBER, fromMs: timeline.segments.find((x) => x.kind === "payoff")?.startMs ?? Infinity }} />
      ) : (
        <>
          <AbsoluteFill style={{ scale: `${push}`, background: `radial-gradient(ellipse at ${30 + scene.variant * 20}% ${35 + scene.hue * 6}%, ${isPayoff ? AMBER : "#22344a"} 0%, ${NIGHT} 72%)` }} />
          <AbsoluteFill style={{ scale: `${1 + (push - 1) * 2.2}`, opacity: 0.45 }}>
            <div
              style={{
                position: "absolute",
                left: "-20%",
                right: "-20%",
                top: `${48 + scene.variant * 9}%`,
                height: 420,
                background: "linear-gradient(transparent, rgba(255,179,71,0.3), transparent)",
                rotate: `${-12 + scene.hue * 6}deg`,
                translate: `${interpolate(local, [0, shotFrames], [-120, 120])}px 0px`,
              }}
            />
          </AbsoluteFill>
        </>
      )}

      <HookCard timeline={timeline} fontFamily={SERIF} color={SILVER} accent={AMBER} em={EM} fontWeight={400} maxSize={150} />

      {segment.kind !== "hook" ? (
        <div style={{ position: "absolute", top: chapter.top, left: chapter.left, width: chapter.width, height: chapter.height, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: roman ? 300 : 96,
              letterSpacing: roman ? "0.02em" : "0.22em",
              lineHeight: 1,
              color: AMBER,
              textShadow: "0 0 60px rgba(255,179,71,0.35)",
              opacity: interpolate(local, [0, 0.15 * fps, 0.9 * fps, 1.3 * fps], [0, 1, 1, 0.22], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              scale: interpolate(local, [0, 0.9 * fps], [1.18, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }),
            }}
          >
            {label}
          </div>
        </div>
      ) : null}

      {isPayoff ? <BigWord word={scene.word} startFrame={startFrame} fontFamily={SERIF} color={darkPayoff ? NIGHT : SILVER} em={EM} fontWeight={400} top={LAYOUT.bigWord.top + 160} stroke={!darkPayoff} /> : null}

      <Captions timeline={timeline} fontFamily={SERIF} color={darkPayoff ? NIGHT : SILVER} accent={darkPayoff ? "#5a2d00" : AMBER} fontSize={118} fontWeight={400} stroke={!darkPayoff} em={EM} />
      {segment.kind === "cta" ? <SaveBadge accent={AMBER} fontFamily={SERIF} label={script.lang === "fr" ? "Garde ça" : "Save this"} /> : null}

      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 30} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: "url(#grain)", opacity: 0.1, mixBlendMode: "overlay" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.7) 100%)" }} />
      <PayoffFlash timeline={timeline} color={AMBER} />
      <ProgressBar color={AMBER} track="rgba(244,239,229,0.15)" />
      <AudioTracks audio={audio} />
    </AbsoluteFill>
  );
}
