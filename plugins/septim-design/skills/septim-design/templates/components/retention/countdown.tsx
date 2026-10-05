"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

// Chapitre 1 : le scroll fait défiler les 3 secondes. Le visiteur vit la fenêtre qu'il accorde à une vidéo.
export function Countdown() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: "top top", end: "+=180%", pin: true, scrub: 0.6 },
        });
        tl.from("[data-n='3']", { opacity: 0, scale: 0.6 })
          .to("[data-n='3']", { opacity: 0, scale: 1.4 })
          .from("[data-n='2']", { opacity: 0, scale: 0.6 }, "<")
          .to("[data-n='2']", { opacity: 0, scale: 1.4 })
          .from("[data-n='1']", { opacity: 0, scale: 0.6 }, "<")
          .to("[data-n='1']", { opacity: 0, scale: 1.4 })
          .from("[data-verdict]", { opacity: 0, y: 40 }, "<");
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      {["3", "2", "1"].map((n) => (
        <span
          key={n}
          data-n={n}
          aria-hidden
          className="stretch absolute text-[clamp(14rem,48vw,34rem)] leading-none font-black text-craie motion-reduce:hidden"
        >
          {n}
        </span>
      ))}
      <div data-verdict className="relative max-w-[30ch] text-center">
        <p className="stretch text-[clamp(2.4rem,6vw,5rem)] leading-[0.95] font-extrabold">71 % sont déjà partis.</p>
        <p className="mt-6 text-brume">
          C&apos;est le temps qu&apos;on t&apos;accorde avant de scroller. Le premier plan doit frapper avant que le pouce bouge.
        </p>
      </div>
    </div>
  );
}
