"use client";

import { useEffect, useRef, useState } from "react";
import { WHATSAPP_URL } from "./site-header";

const FACTS = [
  "Le pouce met 0,25 seconde à décider de scroller.",
  "Une vidéo qui commence au milieu de l'histoire garde plus longtemps qu'une qui commence au début.",
  "Le cerveau retient mieux une tâche inachevée qu'une tâche finie : c'est l'effet Zeigarnik.",
  "Sur TikTok, l'algorithme range d'abord ta vidéo dans la famille de son son.",
  "Une voix claire bat une musique forte : les plateformes transcrivent ce que tu dis.",
  "Changer de plan toutes les 3 secondes suffit à relancer l'attention.",
  "Les récompenses imprévisibles retiennent plus que les récompenses régulières.",
  "Un site sans fin visible supprime le moment où l'on se dit « c'est fini ».",
  "La sauvegarde est le signal le plus fort après le temps de visionnage.",
  "Un sous-titre mot à mot double la compréhension quand le son est coupé.",
  "Les 3 premiers mots d'un hook comptent plus que les 30 suivants.",
  "Une promesse au début, payée à la fin, fait regarder jusqu'au bout.",
  "Un visage qui regarde la caméra arrête le pouce plus vite qu'un texte.",
  "Le tutoiement rapproche : « tu » retient mieux que « vous » sur les vidéos courtes.",
  "Une barre de progression visible fait finir ce qui est commencé.",
  "Revoir une vidéo compte : une boucle bien coupée fait monter le temps de visionnage.",
  "Le silence d'une demi-seconde avant la réponse la rend plus forte.",
  "Un chiffre précis inspire plus confiance qu'un chiffre rond.",
  "Les gens sauvegardent ce qui leur servira demain, pas ce qui les amuse aujourd'hui.",
  "Un fond qui bouge doucement garde l'œil sans le fatiguer.",
  "Une page qui répond à « c'est quoi, c'est pour moi, c'est facile ? » en une demi-seconde garde le visiteur.",
  "Le premier commentaire épinglé relance la discussion, et donc la portée.",
  "Une question dans la légende double les réponses en commentaire.",
  "La même idée racontée trois fois de trois façons s'imprime mieux qu'une fois parfaitement.",
];

const QUESTIONS = [
  "Combien de secondes as-tu passé sur ce site ? Plus que prévu ?",
  "Tu savais que tu cherchais la prochaine carte dorée ?",
  "Et ta vidéo à toi, on la regarde jusqu'au bout ?",
];

const PAGE = 6;

type Card = { kind: "fact" | "question" | "cta"; text: string; style: string };

// Ordre différent à chaque passage pour que le fil ne se répète jamais à l'identique.
function cardAt(i: number): Card {
  if (i > 0 && i % 17 === 0) return { kind: "cta", text: "Tu lis encore. C'est exactement ce qu'on fait pour les clients de nos clients.", style: "bg-camwood text-craie" };
  if (i > 0 && i % 11 === 0) return { kind: "question", text: QUESTIONS[Math.floor(i / 11) % QUESTIONS.length], style: "bg-craie text-nuit" };
  const cycle = Math.floor(i / FACTS.length);
  const text = FACTS[(i * 7 + cycle * 5) % FACTS.length];
  return { kind: "fact", text, style: i % 5 === 2 ? "ndop" : "bg-ndop/40" };
}

// Pas de footer, pas de « fin » : le bol se remplit tout seul, et une carte dorée tombe au hasard.
export function EndlessFeed() {
  const [count, setCount] = useState(PAGE);
  const [golden, setGolden] = useState<number[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);
  const loaded = useRef(PAGE);

  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        const base = loaded.current;
        loaded.current += PAGE;
        setCount(loaded.current);
        // Tirage au moment du chargement : impossible de prévoir où tombera la prochaine carte rare.
        if (Math.random() < 0.6) setGolden((g) => [...g, base + Math.floor(Math.random() * PAGE)]);
        // Si la sentinelle reste visible après le chargement, l'observateur ne se redéclenche pas : on la ré-observe.
        const el = e.target;
        io.unobserve(el);
        requestAnimationFrame(() => io.observe(el));
      },
      { rootMargin: "600px 0px" },
    );
    if (sentinel.current) io.observe(sentinel.current);
    return () => io.disconnect();
  }, []);

  return (
    <div className="px-4 pb-40 md:px-[8vw]">
      <h2 className="stretch max-w-[18ch] text-[clamp(2.2rem,5vw,4.5rem)] leading-[0.95] font-black">Tu peux t&apos;arrêter là. Ou pas.</h2>
      {/* Grille et non colonnes CSS : les cartes déjà lues ne bougent jamais quand le fil s'allonge. */}
      <ul className="mt-12 grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => {
          const card = cardAt(i);
          const isGold = card.kind === "fact" && golden.includes(i);
          return (
            <li key={i} className={`rounded-[1.5rem] p-6 ${isGold ? "bg-raphia text-nuit" : card.style}`}>
              {isGold ? <p className="mb-2 font-display font-extrabold">Carte rare</p> : null}
              <p className={card.kind !== "fact" || i % 3 === 0 ? "font-display text-2xl leading-tight font-bold" : ""}>{card.text}</p>
              {card.kind === "cta" ? (
                <a href={WHATSAPP_URL} className="mt-5 inline-block rounded-full bg-craie px-5 py-3 font-semibold text-nuit">
                  Écrire sur WhatsApp
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div ref={sentinel} aria-hidden className="h-px" />
    </div>
  );
}
