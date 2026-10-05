import { Audio, Video } from "@remotion/media";
import { useMemo, type CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { LAYOUT, bigWordSize, countUpText, hookState } from "./layout";
import { captionPages, msToFrame, segmentAt, type ViralProps } from "./props";

export { emphasisOf } from "./props";

const resolveSrc = (src: string) => (/^(https?:|data:|blob:)/.test(src) ? src : staticFile(src));

// Contour sombre peint sous le remplissage : lisible sur n'importe quel fond, y compris un vrai plan vidéo.
export const outline = (size: number, color = "rgba(0,0,0,0.85)"): CSSProperties => ({
  WebkitTextStroke: `${Math.max(4, Math.round(size * 0.075))}px ${color}`,
  paintOrder: "stroke fill",
  textShadow: "0 10px 34px rgba(0,0,0,0.45)",
});

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
  const startFrame = msToFrame(segment.startMs, fps);
  const local = frame - startFrame;
  const punch = interpolate(local, [0, 0.25 * fps], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return { segment, index, punch, local, startFrame };
}

export function AudioTracks({ audio }: { audio: ViralProps["audio"] }) {
  const { fps } = useVideoConfig();
  return (
    <>
      {audio.ambient ? <Audio name="Lit ambiant" src={resolveSrc(audio.ambient)} loop volume={audio.ambientVolume ?? 0.08} premountFor={fps} /> : null}
      {audio.segments.map((s, i) => (
        <Audio key={i} name={`Voix ${i}`} src={resolveSrc(s.src)} from={msToFrame(s.startMs, fps)} premountFor={fps} />
      ))}
      {(audio.sfx ?? []).map((s, i) => (
        <Audio key={`sfx-${i}`} name={`Bruitage ${i}`} src={resolveSrc(s.src)} from={msToFrame(s.startMs, fps)} volume={s.volume} premountFor={fps} />
      ))}
    </>
  );
}

// Effet Zeigarnik : on voit qu'il reste quelque chose à découvrir.
export function ProgressBar({ color, track = "rgba(255,255,255,0.18)" }: { color: string; track?: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div style={{ position: "absolute", top: 150, left: 70, right: 70, height: 10, borderRadius: 5, background: track, overflow: "hidden" }}>
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

// La phrase du hook entière dès la première image (c'est la miniature), le mot dit s'allume au fil de la voix.
export function HookCard({
  timeline,
  fontFamily,
  color,
  accent,
  em,
  fontWeight = 800,
  uppercase = false,
  maxSize = 124,
}: {
  timeline: ViralProps["timeline"];
  fontFamily: string;
  color: string;
  accent: string;
  em: number;
  fontWeight?: number;
  uppercase?: boolean;
  maxSize?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const hook = hookState(timeline, ms, em, maxSize);
  if (!hook.visible) return null;
  const endFrame = msToFrame(timeline.segments[0].endMs, fps);
  const box = LAYOUT.hook;
  return (
    <div style={{ position: "absolute", top: box.top, left: box.left, width: box.width, height: box.height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily,
          fontSize: hook.fontSize,
          fontWeight,
          lineHeight: 1.06,
          letterSpacing: "-0.02em",
          textAlign: "center",
          textTransform: uppercase ? "uppercase" : "none",
          textWrap: "balance",
          ...outline(hook.fontSize),
          opacity: interpolate(frame, [endFrame - 5, endFrame], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          scale: interpolate(frame, [endFrame - 5, endFrame], [1, 0.92], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {hook.words.map((w, i) => {
          const from = msToFrame(w.startMs, fps);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.26em",
                color: ms >= w.startMs ? accent : color,
                // Le mot qui démarre se soulève : un mot qui grossit mangerait l'espace avec son voisin.
                translate: `0px ${interpolate(frame, [from, from + 6], [-0.08 * hook.fontSize, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) })}px`,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Le mot fort du segment, géant, ajusté à la boîte ; un nombre monte depuis 0.
export function BigWord({
  word,
  startFrame,
  fontFamily,
  color,
  em,
  fontWeight = 800,
  tilt = 0,
  countUp = true,
  top = LAYOUT.bigWord.top,
  stroke = true,
  fit = 1,
}: {
  word: string;
  startFrame: number;
  fontFamily: string;
  color: string;
  em: number;
  fontWeight?: number;
  tilt?: number;
  countUp?: boolean;
  top?: number;
  stroke?: boolean;
  fit?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!word) return null;
  const local = frame - startFrame;
  const { size, lines } = bigWordSize(word, em, 240, fit);
  const pop = spring({ frame: local, fps, config: { damping: 11, stiffness: 170, mass: 0.7 } });
  const counting = countUp && /\d/.test(word);
  const progress = interpolate(local, [0, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.22, 1, 0.36, 1) });
  const box = LAYOUT.bigWord;
  return (
    <div style={{ position: "absolute", top, left: box.left, width: box.width, height: box.height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily,
          fontSize: size,
          fontWeight,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          textAlign: "center",
          color,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "pre",
          ...(stroke ? outline(size) : {}),
          scale: `${0.55 + 0.45 * pop}`,
          rotate: `${tilt * (1 - pop) * 3 + tilt}deg`,
          opacity: interpolate(local, [0, 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {(counting ? countUpText(lines.join("\n"), progress) : lines.join("\n"))}
      </div>
    </div>
  );
}

// Fin de vidéo : le marque-page géant qui respire, pour « garde ça ».
export function SaveIcon({ color, startFrame }: { color: string; startFrame: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - startFrame, fps, config: { damping: 10, stiffness: 160 } });
  const box = LAYOUT.bigWord;
  return (
    <div style={{ position: "absolute", top: box.top, left: box.left, width: box.width, height: box.height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="250" height="310" viewBox="0 0 24 30" style={{ scale: `${(0.5 + 0.5 * pop) * (1 + 0.05 * Math.sin((frame / fps) * Math.PI * 2))}`, filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))" }} aria-hidden>
        <path d="M3 2h18v26l-9-6-9 6z" fill={color} />
      </svg>
    </div>
  );
}

// Flash blanc au moment de la réponse : le cerveau enregistre « c'est maintenant ».
export function PayoffFlash({ timeline, color = "#ffffff" }: { timeline: ViralProps["timeline"]; color?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const payoff = timeline.segments.find((s) => s.kind === "payoff");
  if (!payoff) return null;
  const at = msToFrame(payoff.startMs, fps);
  return <AbsoluteFill style={{ backgroundColor: color, pointerEvents: "none", opacity: interpolate(frame, [at - 1, at, at + 9], [0, 0.55, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />;
}

// Sous-titres mot à mot, mot courant surligné et qui rebondit : la voix est lue même son coupé.
export function Captions({
  timeline,
  fontFamily,
  color,
  accent,
  fontSize = 92,
  uppercase = false,
  fontWeight = 800,
  stroke = true,
}: {
  timeline: ViralProps["timeline"];
  fontFamily: string;
  color: string;
  accent: string;
  fontSize?: number;
  uppercase?: boolean;
  fontWeight?: number;
  // Texte sombre sur fond clair (payoff) : pas de contour sombre, il ferait une tache.
  stroke?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const pages = useMemo(() => captionPages(timeline), [timeline]);
  const page = pages.find((p) => ms >= p.startMs && ms < p.endMs) ?? (ms >= timeline.durationMs ? pages.at(-1) : undefined);
  if (!page) return null;
  const box = LAYOUT.captions;
  return (
    <div style={{ position: "absolute", top: box.top, left: box.left, width: box.width, height: box.height, display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: "0.36em",
          fontFamily,
          fontSize,
          fontWeight,
          lineHeight: 1.06,
          letterSpacing: "-0.02em",
          textAlign: "center",
          textTransform: uppercase ? "uppercase" : "none",
          ...(stroke ? outline(fontSize) : {}),
        }}
      >
        {page.words.map((w, i) => {
          const active = ms >= w.startMs && ms < w.endMs;
          const from = msToFrame(w.startMs, fps);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                color: active ? accent : color,
                translate: `0px ${interpolate(frame, [from, from + 4, from + 9], [0, -0.1 * fontSize, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// CTA final : l'icône de sauvegarde respire pour pousser au « garde ça ». Au-dessus de la légende de l'app.
export function SaveBadge({ accent, fontFamily, label, ink = "#0d0d0b" }: { accent: string; fontFamily: string; label: string; ink?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const box = LAYOUT.badge;
  return (
    <div style={{ position: "absolute", top: box.top, left: box.left, width: box.width, height: box.height, display: "flex", justifyContent: "center", alignItems: "center", scale: `${1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2)}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "24px 42px", borderRadius: 999, background: accent, color: ink, fontFamily, fontSize: 50, fontWeight: 800, boxShadow: "0 18px 50px rgba(0,0,0,0.45)" }}>
        <svg width="42" height="52" viewBox="0 0 24 30" aria-hidden>
          <path d="M3 2h18v26l-9-6-9 6z" fill={ink} />
        </svg>
        {label}
      </div>
    </div>
  );
}

// Plans de fond : tes clips, le B-roll gratuit (ComfyUI, Pexels, Pixabay) ou PRO, un par segment, en lent zoom avant.
// BESOIN CREDIT: Higgsfield Soul / Seedance pour des plans sur mesure. Alternative gratuite: IA locale ComfyUI ou banques libres (broll.ts).
export function BrollBackground({ broll, timeline, dim = 0.45, tint }: { broll: string[]; timeline: ViralProps["timeline"]; dim?: number; tint?: { color: string; fromMs: number } }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {timeline.segments.map((s, i) => {
        const from = msToFrame(s.startMs, fps);
        const length = Math.max(1, msToFrame(s.endMs - s.startMs, fps));
        return (
          <Video
            key={i}
            name={`Plan ${i}`}
            src={resolveSrc(broll[i % broll.length])}
            from={from}
            durationInFrames={length}
            premountFor={fps}
            muted
            objectFit="cover"
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              scale: interpolate(frame, [from, from + length], [1.02, 1.12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          />
        );
      })}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,${dim}) 0%, rgba(0,0,0,${dim * 0.8}) 30%, rgba(0,0,0,${dim * 0.85}) 55%, rgba(0,0,0,${Math.min(0.92, dim * 1.5)}) 100%)`,
        }}
      />
      {/* Au payoff, la couleur du template recouvre le plan : le « moment » reste un moment, même sur de la vraie vidéo. */}
      {tint ? <AbsoluteFill style={{ backgroundColor: tint.color, mixBlendMode: "multiply", opacity: frame >= msToFrame(tint.fromMs, fps) ? 0.85 : 0 }} /> : null}
    </AbsoluteFill>
  );
}
