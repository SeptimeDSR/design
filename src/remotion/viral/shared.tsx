import { Audio } from "@remotion/media";
import { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { captionPages, msToFrame, segmentAt, type ViralProps } from "./props";

export { emphasisOf } from "./props";

const resolveSrc = (src: string) => (/^(https?:|data:|blob:)/.test(src) ? src : staticFile(src));

export function useTimelineMs() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (frame / fps) * 1000;
}

// Pattern interrupt : chaque nouveau segment donne un « coup » visuel (zoom + rotation qui retombent).
export function usePunch(timeline: ViralProps["timeline"]) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const { segment, index } = segmentAt(timeline, ms);
  const local = frame - msToFrame(segment.startMs, fps);
  const punch = interpolate(local, [0, 0.25 * fps], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return { segment, index, punch, local };
}

export function AudioTracks({ audio }: { audio: ViralProps["audio"] }) {
  const { fps } = useVideoConfig();
  return (
    <>
      {audio.ambient ? <Audio name="Lit ambiant" src={resolveSrc(audio.ambient)} loop volume={0.08} premountFor={fps} /> : null}
      {audio.segments.map((s, i) => (
        <Audio key={i} name={`Voix ${i}`} src={resolveSrc(s.src)} from={msToFrame(s.startMs, fps)} premountFor={fps} />
      ))}
    </>
  );
}

// Effet Zeigarnik : on voit qu'il reste quelque chose à découvrir.
export function ProgressBar({ color, track = "rgba(255,255,255,0.18)" }: { color: string; track?: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div style={{ position: "absolute", top: 70, left: 60, right: 60, height: 10, borderRadius: 5, background: track, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          borderRadius: 5,
          background: color,
          width: `${interpolate(frame, [0, durationInFrames - 1], [0, 100], { extrapolateRight: "clamp" })}%`,
        }}
      />
    </div>
  );
}

// Sous-titres mot à mot, mot courant surligné : la voix est lue même son coupé.
export function Captions({
  timeline,
  fontFamily,
  color,
  accent,
  top = "58%",
  fontSize = 92,
  uppercase = false,
}: {
  timeline: ViralProps["timeline"];
  fontFamily: string;
  color: string;
  accent: string;
  top?: string;
  fontSize?: number;
  uppercase?: boolean;
}) {
  const ms = useTimelineMs();
  const pages = useMemo(() => captionPages(timeline), [timeline]);
  const page = pages.find((p) => ms >= p.startMs && ms < p.endMs) ?? (ms >= timeline.durationMs ? pages.at(-1) : undefined);
  if (!page) return null;
  return (
    <AbsoluteFill style={{ top, height: "auto", justifyContent: "flex-start", alignItems: "center", padding: "0 80px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: "0.4em",
          fontFamily,
          fontSize,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          textAlign: "center",
          textTransform: uppercase ? "uppercase" : "none",
          textShadow: "0 6px 30px rgba(0,0,0,0.55)",
        }}
      >
        {page.words.map((w, i) => {
          const active = ms >= w.startMs && ms < w.endMs;
          return (
            <span key={i} style={{ color: active ? accent : color, scale: active ? "1.04" : "1" }}>
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// CTA final : l'icône de sauvegarde respire pour pousser au « garde ça ».
export function SaveBadge({ accent, fontFamily, label }: { accent: string; fontFamily: string; label: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        bottom: 360,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        scale: `${1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2)}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "26px 44px", borderRadius: 999, background: accent, color: "#0d0d0b", fontFamily, fontSize: 52, fontWeight: 800 }}>
        <svg width="46" height="56" viewBox="0 0 24 30" aria-hidden>
          <path d="M3 2h18v26l-9-6-9 6z" fill="#0d0d0b" />
        </svg>
        {label}
      </div>
    </div>
  );
}
