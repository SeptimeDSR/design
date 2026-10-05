import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AudioTracks, BigWord, BrollBackground, Captions, HookCard, PayoffFlash, ProgressBar, SaveBadge, outline, usePunch } from "./shared";
import { CHIP, LAYOUT, chipFontSize, sceneFor } from "./layout";
import { msToFrame, type ViralProps } from "./props";

const PAPER = "#0f1a14";
const CHALK = "#eef5ea";
const ACCENT = "#ffd54a";
const MONO = "'JetBrains Mono Variable', ui-monospace, monospace";
const EM = 0.6;

// Maths : les chiffres arrivent un à un et montent depuis 0 ; la case « = ? » reste ouverte jusqu'au payoff.
export function ViralMaths({ script, timeline, audio, broll }: ViralProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { segment, index, punch, startFrame } = usePunch(timeline);
  const scene = sceneFor(script, timeline, index);
  const revealed = segment.kind === "payoff" || segment.kind === "cta";
  const payoffIndex = timeline.segments.findIndex((s) => s.kind === "payoff");
  const payoffStart = msToFrame(timeline.segments[payoffIndex]?.startMs ?? 0, fps);
  const answer = payoffIndex >= 0 ? sceneFor(script, timeline, payoffIndex).word : "";
  // Les chiffres déjà vus restent au tableau (les 3 derniers) : on suit le calcul sans relire.
  const numbers = timeline.segments
    .slice(1, Math.min(index, payoffIndex >= 0 ? payoffIndex : index))
    .map((_, i) => sceneFor(script, timeline, i + 1).word)
    .filter((w) => /\d/.test(w))
    .slice(-3);
  const isNumber = /\d/.test(scene.word);
  const chips = LAYOUT.chips;
  const chipSize = chipFontSize(numbers, EM);
  const box = LAYOUT.answerBox;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PAPER,
        backgroundImage: `linear-gradient(rgba(238,245,234,0.07) 2px, transparent 2px), linear-gradient(90deg, rgba(238,245,234,0.07) 2px, transparent 2px)`,
        backgroundSize: "90px 90px",
        backgroundPosition: `0 ${-frame * 0.6}px`,
      }}
    >
      {/* BESOIN CREDIT: Higgsfield Seedance pour un plan de tableau filmé. Alternative gratuite: B-roll ComfyUI / Pexels, sinon ce papier quadrillé Remotion. */}
      {broll?.length ? <BrollBackground broll={broll} timeline={timeline} dim={0.75} /> : null}

      <HookCard timeline={timeline} fontFamily={MONO} color={CHALK} accent={ACCENT} em={EM} />

      {segment.kind === "beat" || segment.kind === "payoff" ? (
        <div
          style={{
            position: "absolute",
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 22,
            border: `5px solid ${ACCENT}`,
            background: revealed ? ACCENT : "rgba(15,26,20,0.85)",
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: 64,
            color: revealed ? PAPER : ACCENT,
            scale: `${1 + (revealed ? 0 : punch * 0.06)}`,
          }}
        >
          {revealed ? "✓" : "= ?"}
        </div>
      ) : null}

      {segment.kind === "beat" ? (
        <BigWord word={scene.word} startFrame={startFrame} fontFamily={MONO} color={isNumber ? ACCENT : CHALK} em={EM} tilt={0} />
      ) : null}

      {segment.kind === "beat" && numbers.length ? (
        <div style={{ position: "absolute", top: chips.top, left: chips.left, width: chips.width, height: chips.height, display: "flex", gap: CHIP.gap, justifyContent: "center", alignItems: "center" }}>
          {numbers.map((n, i) => (
            <div key={`${n}-${i}`} style={{ padding: `14px ${CHIP.padX}px`, borderRadius: 999, border: `${CHIP.border}px solid rgba(238,245,234,0.45)`, fontFamily: MONO, fontSize: chipSize, fontWeight: 700, color: CHALK, background: "rgba(15,26,20,0.8)", opacity: i === numbers.length - 1 ? 1 : 0.6, whiteSpace: "nowrap" }}>
              {n}
            </div>
          ))}
        </div>
      ) : null}

      {revealed ? (
        <>
          <BigWord word={answer} startFrame={payoffStart} fontFamily={MONO} color={ACCENT} em={EM} fit={0.72} />
          <svg width={LAYOUT.bigWord.width} height={LAYOUT.bigWord.height} viewBox={`0 0 ${LAYOUT.bigWord.width} ${LAYOUT.bigWord.height}`} style={{ position: "absolute", top: LAYOUT.bigWord.top, left: LAYOUT.bigWord.left }}>
            <ellipse
              cx={LAYOUT.bigWord.width / 2}
              cy={LAYOUT.bigWord.height / 2}
              rx={LAYOUT.bigWord.width / 2 - 12}
              ry={LAYOUT.bigWord.height / 2 - 40}
              stroke={ACCENT}
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="2400"
              strokeDashoffset={interpolate(frame - payoffStart, [0.4 * fps, 1.1 * fps], [2400, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.65, 0, 0.35, 1) })}
              transform={`rotate(-4 ${LAYOUT.bigWord.width / 2} ${LAYOUT.bigWord.height / 2})`}
            />
          </svg>
        </>
      ) : null}

      {segment.kind === "cta" ? (
        <div style={{ position: "absolute", top: LAYOUT.chips.top, left: LAYOUT.chips.left, width: LAYOUT.chips.width, textAlign: "center", fontFamily: MONO, fontSize: 46, fontWeight: 700, color: CHALK, ...outline(46) }}>
          {script.lang === "fr" ? "Refais le calcul chez toi." : "Run the numbers yourself."}
        </div>
      ) : null}

      <Captions timeline={timeline} fontFamily={MONO} color={CHALK} accent={ACCENT} fontSize={84} em={EM} />
      {segment.kind === "cta" ? <SaveBadge accent={ACCENT} fontFamily={MONO} label={script.lang === "fr" ? "Garde ça" : "Save this"} ink={PAPER} /> : null}
      <PayoffFlash timeline={timeline} color={ACCENT} />
      <ProgressBar color={ACCENT} track="rgba(238,245,234,0.15)" />
      <AudioTracks audio={audio} />
    </AbsoluteFill>
  );
}
