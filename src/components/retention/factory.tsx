import { ViralPhone } from "./viral-phone";

const STEPS = [
  "Toutes les 6 heures, l'usine lit les tendances du jour.",
  "Elle écrit un hook qui frappe en moins de 3 secondes.",
  "Une voix grave, générée chez toi, sans abonnement.",
  "Le rendu vertical : sous-titres, rythme, réponse à la fin.",
  "Un message WhatsApp : « Vidéo prête boss, je publie ? »",
  "Tu réponds OUI. Elle part sur TikTok, YouTube, Instagram et Facebook.",
];

export function Factory() {
  return (
    <div className="px-4 py-28 md:px-[8vw]">
      <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <h2 className="stretch text-[clamp(2.6rem,6vw,5.5rem)] leading-[0.92] font-black">Une usine qui tourne pendant que tu dors.</h2>
          <ol className="mt-10 space-y-5">
            {STEPS.map((step, i) => (
              <li key={step} className="grid grid-cols-[2.5rem_1fr] gap-3">
                <span className="font-display text-2xl font-black text-raphia">{i + 1}</span>
                <span className="text-craie/90">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-[52ch] text-brume">
            Version gratuite : Remotion et une voix locale, 0 crédit. Version cinéma : des plans générés par Higgsfield, seulement quand tu acceptes le coût affiché.
          </p>
        </div>
        <div className="grid grid-cols-3 items-end gap-3 sm:gap-5">
          <ViralPhone template="story" topic="le mobile money" className="translate-y-6" />
          <ViralPhone template="maths" topic="la tontine" />
          <ViralPhone template="film" topic="la reine Njinga" className="translate-y-12" />
        </div>
      </div>
      <figure className="mt-20 max-w-md rounded-[1.5rem] bg-[#0b3d2e] p-5 text-[#e7fff4]">
        <p className="text-sm opacity-70">WhatsApp, 06:02</p>
        <blockquote className="mt-2 leading-snug">
          Vidéo prête boss, « Personne ne t&apos;a jamais dit ça… ». Réponds OUI pour publier sur TikTok, YouTube, Facebook, Instagram.
        </blockquote>
        <p className="mt-3 ml-auto w-fit rounded-xl bg-[#1f6e52] px-3 py-1.5 font-semibold">OUI</p>
      </figure>
    </div>
  );
}
