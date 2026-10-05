"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

// FREE — GSAP ScrollTrigger : chaque mot s'allume au rythme du scroll.
export function ScrubText({ text }: { text: string }) {
  const root = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          "[data-word]",
          { opacity: 0.12 },
          {
            opacity: 1,
            stagger: 0.08,
            ease: "none",
            scrollTrigger: { trigger: root.current, start: "top 80%", end: "bottom 45%", scrub: true },
          },
        );
      });
    },
    { scope: root },
  );

  return (
    <p ref={root} className="font-display text-[clamp(2rem,5vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.03em]">
      {text.split(" ").map((word, i) => (
        <span key={i} data-word className="inline-block pr-[0.25em]">
          {word}
        </span>
      ))}
    </p>
  );
}
