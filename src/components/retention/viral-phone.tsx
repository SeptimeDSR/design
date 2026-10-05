"use client";

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/instrument-serif";
import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState } from "react";
import { ViralStory } from "@/remotion/viral/ViralStory";
import { ViralMaths } from "@/remotion/viral/ViralMaths";
import { ViralFilm } from "@/remotion/viral/ViralFilm";
import { durationInFrames, VIRAL_FPS, VIRAL_HEIGHT, VIRAL_WIDTH } from "@/remotion/viral/props";
import { sampleProps } from "@/remotion/viral/sample";
import type { TemplateId } from "@/viral-engine/types";

const COMPONENTS = { story: ViralStory, maths: ViralMaths, film: ViralFilm };

// Un vrai template de l'usine, joué en direct : ne tourne que lorsqu'il est visible,
// jamais tout seul si le visiteur a demandé moins de mouvement, et toujours pausable.
export function ViralPhone({ template, topic, className }: { template: TemplateId; topic?: string; className?: string }) {
  const ref = useRef<PlayerRef>(null);
  const box = useRef<HTMLDivElement>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const props = useMemo(() => sampleProps(template, topic), [template, topic]);

  useEffect(() => {
    const player = ref.current;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player?.addEventListener("play", onPlay);
    player?.addEventListener("pause", onPause);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) ref.current?.pause();
        else if (!userPaused.current && !reduced.matches) ref.current?.play();
      },
      { threshold: 0.3 },
    );
    if (box.current) io.observe(box.current);
    return () => {
      io.disconnect();
      player?.removeEventListener("play", onPlay);
      player?.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = () => {
    if (playing) {
      userPaused.current = true;
      ref.current?.pause();
    } else {
      userPaused.current = false;
      ref.current?.play();
    }
  };

  return (
    <div
      ref={box}
      data-viral-phone
      data-playing={playing}
      className={`relative rounded-[2.4rem] bg-[#05061a] p-2.5 shadow-[0_30px_80px_-20px_rgba(5,6,26,0.9)] ring-1 ring-craie/15 ${className ?? ""}`}
    >
      <Player
        ref={ref}
        component={COMPONENTS[template]}
        inputProps={props}
        durationInFrames={durationInFrames(props.timeline)}
        fps={VIRAL_FPS}
        compositionWidth={VIRAL_WIDTH}
        compositionHeight={VIRAL_HEIGHT}
        loop
        initiallyMuted
        controls={false}
        style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: "1.9rem", overflow: "hidden" }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Mettre la vidéo en pause" : "Lire la vidéo"}
        className="absolute right-5 bottom-5 grid size-11 place-items-center rounded-full bg-nuit/80 text-craie ring-1 ring-craie/30 backdrop-blur hover:bg-nuit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-raphia"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
          {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
        </svg>
      </button>
    </div>
  );
}
