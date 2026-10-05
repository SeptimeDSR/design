"use client";

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/instrument-serif";
import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef } from "react";
import { ViralStory } from "@/remotion/viral/ViralStory";
import { ViralMaths } from "@/remotion/viral/ViralMaths";
import { ViralFilm } from "@/remotion/viral/ViralFilm";
import { durationInFrames, VIRAL_FPS, VIRAL_HEIGHT, VIRAL_WIDTH } from "@/remotion/viral/props";
import { sampleProps } from "@/remotion/viral/sample";
import type { TemplateId } from "@/viral-engine/types";

const COMPONENTS = { story: ViralStory, maths: ViralMaths, film: ViralFilm };

// Un vrai template de l'usine, joué en direct : ne tourne que lorsqu'il est visible.
export function ViralPhone({ template, topic, className }: { template: TemplateId; topic?: string; className?: string }) {
  const ref = useRef<PlayerRef>(null);
  const box = useRef<HTMLDivElement>(null);
  const props = useMemo(() => sampleProps(template, topic), [template, topic]);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? ref.current?.play() : ref.current?.pause()), { threshold: 0.3 });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className={`rounded-[2.4rem] bg-[#05061a] p-2.5 shadow-[0_30px_80px_-20px_rgba(5,6,26,0.9)] ring-1 ring-craie/15 ${className ?? ""}`}>
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
    </div>
  );
}
