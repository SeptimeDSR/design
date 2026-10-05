"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const INTERRUPTS = [
  { title: "Changer d'angle", body: "Le même sujet, vu d'ailleurs. Le cerveau relance son attention.", tone: "bg-craie text-nuit", type: "font-black [font-stretch:62%]" },
  { title: "Changer d'échelle", body: "Un gros plan après un plan large. La taille surprend avant le sens.", tone: "bg-camwood text-craie", type: "font-extrabold [font-stretch:150%]" },
  { title: "Changer de son", body: "Un silence, un souffle, une note. L'oreille réveille les yeux.", tone: "ndop text-craie", type: "font-light [font-stretch:120%]" },
  { title: "Couper au milieu", body: "On coupe pendant le geste, pas après. La suite devient obligatoire.", tone: "bg-raphia text-nuit", type: "font-black [font-stretch:80%]" },
  { title: "Montrer un visage", body: "Un regard caméra coupe le défilement plus vite que n'importe quel titre.", tone: "bg-nuit text-craie outline outline-2 outline-craie/30", type: "font-semibold [font-stretch:100%]" },
];

// Chapitre 4 : chaque carte casse le rythme de la précédente, comme un montage toutes les 3 secondes.
export function InterruptRail() {
  const section = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const distance = () => (track.current?.scrollWidth ?? 0) - window.innerWidth;
        gsap.to(track.current, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: { trigger: section.current, start: "top top", end: () => `+=${distance()}`, pin: true, scrub: 1, invalidateOnRefresh: true },
        });
      });
    },
    { scope: section },
  );

  return (
    <div ref={section} className="overflow-hidden py-20 md:flex md:h-screen md:items-center md:py-0">
      <ol ref={track} className="flex flex-col gap-5 px-4 md:flex-row md:gap-6 md:px-[8vw]">
        {INTERRUPTS.map((it, i) => (
          <li
            key={it.title}
            className={`${it.tone} flex min-h-72 shrink-0 flex-col justify-between rounded-[2rem] p-8 md:h-[62vh] md:w-[34vw] md:min-w-[22rem] ${i % 2 ? "md:mt-24" : ""}`}
          >
            <h3 className={`font-display text-[clamp(2.4rem,4.4vw,4.2rem)] leading-[0.92] ${it.type}`}>{it.title}</h3>
            <p className="max-w-[32ch] text-lg opacity-85">{it.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
