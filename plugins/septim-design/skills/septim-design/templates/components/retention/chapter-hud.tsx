"use client";

import { useEffect, useState } from "react";
import { CHAPTERS } from "./chapters";
import { SoundToggle, useSound } from "./sound";

// Effet Zeigarnik : on voit toujours ce qui reste à découvrir.
export function ChapterHud() {
  const [current, setCurrent] = useState(-1);
  const { tick } = useSound();

  useEffect(() => {
    const sections = CHAPTERS.map((c) => document.getElementById(c.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrent(CHAPTERS.findIndex((c) => c.id === e.target.id));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (current >= 0) tick();
  }, [current, tick]);

  const done = current + 1;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-between gap-4 p-4 md:p-6">
      <div className="pointer-events-auto rounded-2xl bg-nuit/85 px-4 py-3 backdrop-blur-md" aria-hidden={current < 0}>
        <p className="text-sm text-brume">
          {current < 0 ? "7 chapitres t'attendent" : `Chapitre ${done} sur ${CHAPTERS.length} : ${CHAPTERS[current].title}`}
        </p>
        <div className="mt-2 flex gap-1.5">
          {CHAPTERS.map((c, i) => (
            <span key={c.id} className={`h-1.5 w-6 rounded-full transition-colors duration-500 ${i < done ? "bg-raphia" : "bg-craie/20"}`} />
          ))}
        </div>
      </div>
      <SoundToggle className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-nuit/85 px-4 py-3 text-sm text-craie backdrop-blur-md hover:bg-ndop" />
    </div>
  );
}
