"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

type Tool = { name: string; role: string; tier: "FREE" | "PRO" };

// FREE — GSAP ScrollTrigger : section épinglée, défilement horizontal piloté par le scroll vertical.
export function StackRail({ tools }: { tools: Tool[] }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const distance = () => (track.current?.scrollWidth ?? 0) - window.innerWidth;
        gsap.to(track.current, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: section.current,
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });
      });
    },
    { scope: section },
  );

  return (
    <section ref={section} className="overflow-hidden py-24 md:flex md:h-screen md:items-center md:py-0">
      <div ref={track} className="flex flex-col gap-6 px-4 md:flex-row md:gap-8 md:px-[8vw]">
        {tools.map((tool) => (
          <article
            key={tool.name}
            className="flex min-h-64 shrink-0 flex-col justify-between rounded-3xl border border-bone/15 bg-bone/[0.03] p-8 md:h-[56vh] md:w-[30vw] md:min-w-80"
          >
            <span
              className={cn(
                "self-start rounded-full px-3 py-1 font-mono text-sm",
                tool.tier === "FREE" ? "bg-bone/10 text-bone" : "bg-signal text-ink",
              )}
            >
              {tool.tier === "FREE" ? "Gratuit" : "Crédits"}
            </span>
            <div>
              <h3 className="font-display text-4xl font-semibold tracking-[-0.03em] md:text-5xl">{tool.name}</h3>
              <p className="mt-3 max-w-[32ch] text-bone/65">{tool.role}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
