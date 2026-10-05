"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Am7 – Fmaj7 – Cmaj7 – G6 : la même boucle lo-fi que l'usine vidéo, jouée en direct, jamais sans clic.
const CHORDS = [
  [220.0, 261.63, 329.63, 392.0],
  [174.61, 220.0, 261.63, 329.63],
  [130.81, 164.81, 196.0, 246.94],
  [196.0, 246.94, 293.66, 329.63],
];

type SoundApi = { enabled: boolean; toggle: () => void; tick: () => void };
const SoundContext = createContext<SoundApi>({ enabled: false, toggle: () => {}, tick: () => {} });
export const useSound = () => useContext(SoundContext);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const start = useCallback(() => {
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(master).connect(ctx.destination);
    masterRef.current = master;

    const voices = CHORDS[0].map((f) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(filter);
      osc.start();
      return osc;
    });
    let step = 0;
    timerRef.current = window.setInterval(() => {
      step = (step + 1) % CHORDS.length;
      voices.forEach((osc, i) => osc.frequency.linearRampToValueAtTime(CHORDS[step][i], ctx.currentTime + 1.2));
    }, 4000);
    void ctx.resume();
  }, []);

  const stop = useCallback(() => {
    window.clearInterval(timerRef.current);
    const ctx = ctxRef.current;
    if (ctx && masterRef.current) {
      masterRef.current.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
      window.setTimeout(() => void ctx.close(), 700);
    }
    ctxRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    setEnabled((on) => {
      if (on) stop();
      else start();
      return !on;
    });
  }, [start, stop]);

  // Petit « tic » de changement de chapitre : la récompense s'entend.
  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !masterRef.current) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1320;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }, []);

  useEffect(() => stop, [stop]);

  return <SoundContext.Provider value={{ enabled, toggle, tick }}>{children}</SoundContext.Provider>;
}

export function SoundToggle({ className }: { className?: string }) {
  const { enabled, toggle } = useSound();
  return (
    <button type="button" onClick={toggle} aria-pressed={enabled} className={className}>
      <span aria-hidden className="flex h-4 items-end gap-[3px]">
        {[0.5, 1, 0.7, 0.9].map((h, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-current transition-[height] duration-500"
            style={{ height: enabled ? `${h * 100}%` : "25%" }}
          />
        ))}
      </span>
      {enabled ? "Couper le son" : "Activer le son"}
    </button>
  );
}
