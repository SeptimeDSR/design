import { HeroScene } from "@/components/hero/hero-scene";
import { HeroVideo } from "@/components/video/hero-video";
import { Reveal } from "@/components/motion/reveal";
import { ScrubText } from "@/components/sections/scrub-text";
import { StackRail } from "@/components/sections/stack-rail";

const tools = [
  { name: "Lenis", role: "Le scroll beurre : inertie douce, synchronisée avec GSAP.", tier: "FREE" },
  { name: "GSAP", role: "ScrollTrigger, pin, scrub : la mise en scène pilotée par le scroll.", tier: "FREE" },
  { name: "Motion", role: "Apparitions, gestes et layout animations côté React.", tier: "FREE" },
  { name: "Three / R3F", role: "La 3D codée qui remplace Spline quand il n'y a pas de scène.", tier: "FREE" },
  { name: "Remotion", role: "Des vidéos écrites en React, rendues en MP4 sans crédit.", tier: "FREE" },
  { name: "Higgsfield", role: "Soul + Seedance pour les plans hero cinématiques.", tier: "PRO" },
  { name: "Runway · Pika", role: "Gen-4.5, Seedance 2.0, Pika Agents : options vidéo payantes.", tier: "PRO" },
] as const;

export default function Home() {
  return (
    <main>
      <section className="relative flex min-h-screen flex-col justify-between overflow-hidden px-4 pt-6 pb-10 md:px-[8vw]">
        <HeroScene className="absolute inset-0 md:left-[35%]" />
        <header className="relative flex items-center justify-between font-mono text-sm">
          <span>Septim</span>
          <span className="text-bone/60">Design stack · 2026</span>
        </header>
        <div className="relative">
          <Reveal onMount>
            <h1 className="max-w-[9ch] font-display text-[clamp(3.2rem,11vw,10rem)] leading-[0.88] font-bold tracking-[-0.05em]">
              Le scroll qui retient.
            </h1>
          </Reveal>
          <Reveal onMount delay={0.15}>
            <p className="mt-8 max-w-[42ch] text-lg text-bone/70">
              Chaque effet existe en deux versions : une version gratuite qui tourne tout de suite, une version
              à crédits quand le client paie le plan cinéma.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-4 py-32 md:px-[8vw] md:py-48">
        <ScrubText text="Un visiteur décide en trois secondes s'il reste. Le mouvement, la matière et le rythme du scroll font ce travail avant le premier mot lu." />
      </section>

      <StackRail tools={[...tools]} />

      <section className="px-4 py-32 md:px-[8vw]">
        <Reveal>
          <h2 className="mb-10 max-w-[20ch] font-display text-[clamp(2.2rem,5vw,4rem)] leading-none font-semibold tracking-[-0.03em]">
            Le plan hero, rendu par du code.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <HeroVideo className="w-full overflow-hidden rounded-3xl border border-bone/10" />
        </Reveal>
        <p className="mt-6 max-w-[60ch] font-mono text-sm text-bone/55">
          Remotion par défaut. Renseignez NEXT_PUBLIC_HERO_VIDEO_URL avec un rendu Higgsfield, Runway ou Pika
          pour passer en version PRO.
        </p>
      </section>

      <footer className="flex flex-col gap-4 border-t border-bone/10 px-4 py-16 md:flex-row md:items-end md:justify-between md:px-[8vw]">
        <p className="font-display text-[clamp(2.5rem,8vw,7rem)] leading-none font-bold tracking-[-0.05em]">On lance ?</p>
        <p className="font-mono text-sm text-bone/55">.claude/INVENTAIRE-DESIGN-2026.md</p>
      </footer>
    </main>
  );
}
