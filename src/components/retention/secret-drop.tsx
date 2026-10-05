"use client";

import { useEffect, useRef, useState } from "react";
import { useSound } from "./sound";

const SECRETS = [
  "Une question au début garde plus de monde qu'une affirmation.",
  "Les sous-titres comptent plus que l'image : 8 vidéos sur 10 sont regardées sans le son.",
  "Une vidéo de 30 secondes revue deux fois vaut mieux qu'une de 15 secondes regardée une fois.",
  "La réponse tardive marche parce que le cerveau déteste les histoires sans fin.",
  "Une barre de progression visible fait rester : on veut finir ce qui est commencé.",
  "La sauvegarde pèse plus que le like dans le classement des plateformes.",
];

// Récompense variable : au moment où l'emplacement entre à l'écran, on tire au hasard s'il cache un secret.
export function SecretDrop({ slot }: { slot: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const { tick } = useSound();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        if (Math.random() < 0.55) {
          setSecret(SECRETS[(slot + Math.floor(Math.random() * SECRETS.length)) % SECRETS.length]);
          tick();
        }
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [slot, tick]);

  return (
    <div ref={ref} className="flex min-h-[11rem] items-center px-4 md:px-[8vw]" aria-live="polite">
      {secret ? (
        <aside className="ml-auto max-w-md rotate-[-1.5deg] rounded-[1.5rem] bg-raphia p-6 text-nuit motion-safe:animate-[drop_0.7s_cubic-bezier(0.16,1,0.3,1)]">
          <p className="font-display text-xl font-extrabold">Tu as trouvé un secret.</p>
          <p className="mt-2">{secret}</p>
        </aside>
      ) : null}
    </div>
  );
}
