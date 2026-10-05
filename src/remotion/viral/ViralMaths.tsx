import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AudioTracks, BrollBackground, Captions, ProgressBar, SaveBadge, emphasisOf, usePunch } from "./shared";
import { msToFrame, type ViralProps } from "./props";

const PAPER = "#0f1a14";
const CHALK = "#e8f1e4";
const ACCENT = "#ffd54a";
const MONO = "'JetBrains Mono Variable', ui-monospace, monospace";

// Maths : chaque beat ajoute un terme à l'équation. Le résultat reste « ? » jusqu'au payoff.
export function ViralMaths({ script, timeline, audio, broll }: ViralProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { segment, index, punch } = usePunch(timeline);
  const terms = timeline.segments
    .slice(1, index + 1)
    .filter((s) => s.kind === "beat")
    .map((s, i) => emphasisOf(s.text, script.beats[i]?.emphasis))
    .slice(-3);
  const revealed = segment.kind === "payoff" || segment.kind === "cta";
  const answer = emphasisOf(script.payoff);
  // Le soulignement se dessine depuis le début de la réponse et reste tracé pendant le CTA.
  const payoffStart = msToFrame(timeline.segments.find((s) => s.kind === "payoff")?.startMs ?? 0, fps);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PAPER,
        backgroundImage: `linear-gradient(rgba(232,241,228,0.07) 2px, transparent 2px), linear-gradient(90deg, rgba(232,241,228,0.07) 2px, transparent 2px)`,
        backgroundSize: "90px 90px",
        backgroundPosition: `0 ${-frame * 0.6}px`,
      }}
    >
      {/* BESOIN CREDIT: Higgsfield Seedance pour un plan de tableau filmé. Alternative gratuite: papier quadrillé Remotion. */}
      {broll?.length ? <BrollBackground broll={broll} timeline={timeline} dim={0.75} /> : null}

      <AbsoluteFill style={{ top: 200, height: "auto", padding: "0 70px", alignItems: "center" }}>
        {/* Les données s'empilent comme au tableau : pas de « + » qui ferait lire une fausse addition. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: MONO, color: CHALK, fontSize: 54, minHeight: 210 }}>
          {terms.map((t, i) => (
            <span key={`${t}-${i}`} style={{ opacity: i === terms.length - 1 ? 1 : 0.45 }}>
              {t}
            </span>
          ))}
        </div>
        <div
          style={{
            marginTop: 40,
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: revealed ? 120 : 180,
            color: revealed ? ACCENT : CHALK,
            textAlign: "center",
            scale: `${1 + punch * 0.12}`,
          }}
        >
          {revealed ? `= ${answer}` : "?"}
        </div>
        {revealed ? (
          <svg width="760" height="40" viewBox="0 0 760 40" style={{ marginTop: 10 }}>
            <path
              d="M10 25 C 200 5, 520 40, 750 15"
              stroke={ACCENT}
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="800"
              strokeDashoffset={interpolate(frame - payoffStart, [0, 0.6 * fps], [800, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.65, 0, 0.35, 1) })}
            />
          </svg>
        ) : null}
      </AbsoluteFill>

      <Captions timeline={timeline} fontFamily={MONO} color={CHALK} accent={ACCENT} top="62%" fontSize={76} />
      {segment.kind === "cta" ? <SaveBadge accent={ACCENT} fontFamily={MONO} label={script.lang === "fr" ? "Garde ça" : "Save this"} /> : null}
      <ProgressBar color={ACCENT} track="rgba(232,241,228,0.15)" />
      <AudioTracks audio={audio} />
    </AbsoluteFill>
  );
}
