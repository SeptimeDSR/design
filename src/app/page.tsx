import { Reveal } from "@/components/motion/reveal";
import { ChapterHud } from "@/components/retention/chapter-hud";
import { Countdown } from "@/components/retention/countdown";
import { EndlessFeed } from "@/components/retention/endless-feed";
import { Factory } from "@/components/retention/factory";
import { InterruptRail } from "@/components/retention/interrupt-rail";
import { SecretDrop } from "@/components/retention/secret-drop";
import { SiteHeader, WHATSAPP_URL } from "@/components/retention/site-header";
import { SoundToggle } from "@/components/retention/sound";
import { StretchDriver } from "@/components/retention/stretch-driver";
import { ViralPhone } from "@/components/retention/viral-phone";

function ChapterLabel({ n }: { n: number }) {
  return <p className="mb-6 text-craie/75">Chapitre {n}</p>;
}

export default function Home() {
  return (
    <main id="top">
      <StretchDriver />
      <SiteHeader />
      <ChapterHud />

      <section className="grid min-h-screen items-center gap-12 px-4 pt-28 pb-28 md:px-[8vw] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <div>
          <Reveal onMount>
            <h1 className="stretch max-w-[17ch] text-[clamp(2.8rem,6vw,6.2rem)] leading-[0.9] font-black">
              Des sites et des vidéos qu&apos;on n&apos;arrive pas à quitter.
            </h1>
          </Reveal>
          <Reveal onMount delay={0.12}>
            <p className="mt-7 max-w-[46ch] text-xl text-craie/85">
              Septim est un studio à Yaoundé. On conçoit pour les marques et les créateurs qui veulent être regardés jusqu&apos;au bout.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={WHATSAPP_URL} className="rounded-full bg-camwood px-7 py-4 font-semibold text-craie hover:bg-[#9f3b26]">
                Écrire sur WhatsApp
              </a>
              <a href="#trois-secondes" className="rounded-full px-7 py-4 font-semibold text-craie ring-1 ring-craie/30 hover:bg-ndop">
                Voir la méthode
              </a>
            </div>
            <p className="mt-8 max-w-[50ch] text-brume">
              71 % des gens décident en 3 secondes s&apos;ils restent. À la fin de cette page, tu sauras ce qu&apos;on met dans ces 3 secondes.
            </p>
          </Reveal>
        </div>
        <ViralPhone template="story" topic="ton attention" className="mx-auto w-full max-w-[19rem] rotate-[2deg]" />
      </section>

      <section id="trois-secondes">
        <Countdown />
      </section>

      <SecretDrop slot={1} />

      <section id="le-mot" className="ndop px-4 py-32 md:px-[8vw]">
        <ChapterLabel n={2} />
        <p className="stretch max-w-[18ch] text-[clamp(2.4rem,6.5vw,6rem)] leading-[0.95] font-black">
          Pendant ces 3 secondes, on ne vend rien. On ouvre une <span className="inline-block w-[4.5ch] border-b-[0.12em] border-raphia align-baseline" aria-label="mot caché" />.
        </p>
        <p className="mt-10 max-w-[48ch] text-xl text-craie/85">
          Ton cerveau veut déjà connaître le mot. Garde cette envie : c&apos;est exactement elle qui te fait rester. Le mot arrive au chapitre 7.
        </p>
      </section>

      <section id="le-son" className="px-4 py-32 md:px-[8vw]">
        <ChapterLabel n={3} />
        <h2 className="stretch max-w-[16ch] text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] font-black">La moitié d&apos;une vidéo virale s&apos;écoute.</h2>
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <p className="max-w-[46ch] text-xl text-craie/85">
            Sur TikTok, un son qui monte entraîne les vidéos qui l&apos;utilisent. Une voix claire bat une musique forte : les plateformes transcrivent ce que tu dis.
          </p>
          <div>
            <SoundToggle className="flex items-center gap-3 rounded-full bg-craie px-7 py-4 font-semibold text-nuit hover:bg-white" />
            <p className="mt-4 text-brume">Une nappe douce, générée en direct. Rien ne joue sans ton clic.</p>
          </div>
        </div>
      </section>

      <SecretDrop slot={2} />

      <section id="interruptions">
        <div className="px-4 pt-24 md:px-[8vw]">
          <ChapterLabel n={4} />
          <h2 className="stretch max-w-[18ch] text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] font-black">Toutes les 3 secondes, quelque chose change.</h2>
        </div>
        <InterruptRail />
      </section>

      <section id="recompense" className="px-4 py-32 md:px-[8vw]">
        <ChapterLabel n={5} />
        <h2 className="stretch max-w-[18ch] text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] font-black">
          Tu ne sais pas quand elle arrive. C&apos;est pour ça que tu restes.
        </h2>
        <p className="mt-10 max-w-[50ch] text-xl text-craie/85">
          Une récompense prévisible ennuie. Une récompense qui peut tomber à tout moment fait continuer. Des secrets sont cachés dans cette page, jamais au même endroit.
        </p>
      </section>

      <SecretDrop slot={3} />

      <section id="usine">
        <div className="px-4 pt-16 md:px-[8vw]">
          <ChapterLabel n={6} />
        </div>
        <Factory />
      </section>

      <SecretDrop slot={4} />

      <section id="reponse" className="ndop px-4 py-36 md:px-[8vw]">
        <ChapterLabel n={7} />
        <p className="stretch text-[clamp(3rem,10vw,10rem)] leading-[0.88] font-black">
          On ouvre une <span className="text-raphia">question</span>.
        </p>
        <p className="mt-10 max-w-[52ch] text-xl text-craie/90">
          Les 3 premières secondes ne vendent rien. Elles posent une question que ton cerveau refuse de laisser ouverte. Tout le reste, le son, le rythme, les récompenses, sert à repousser la réponse juste assez longtemps.
        </p>
        <a href={WHATSAPP_URL} className="mt-12 inline-block rounded-full bg-camwood px-8 py-5 text-lg font-semibold text-craie hover:bg-[#9f3b26]">
          Écrire sur WhatsApp
        </a>
      </section>

      <SecretDrop slot={5} />
      <EndlessFeed />
    </main>
  );
}
