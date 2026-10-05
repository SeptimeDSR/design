"use client";

import { useEffect, useRef } from "react";
import { useLenis } from "lenis/react";

// Un seul geste fort sur toute la page : plus tu scrolles vite, plus les titres s'étirent.
export function StretchDriver() {
  const target = useRef(100);
  const current = useRef(100);

  useLenis((lenis) => {
    target.current = 100 + Math.min(Math.abs(lenis.velocity) * 2.4, 48);
  });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    let frame = 0;
    const loop = () => {
      target.current += (100 - target.current) * 0.06; // retour au repos
      current.current += (target.current - current.current) * 0.18;
      root.style.setProperty("--stretch", `${current.current.toFixed(1)}%`);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
