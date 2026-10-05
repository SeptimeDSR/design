"use client";

import { useRef } from "react";

export const WHATSAPP_URL = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  ? `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour Septim, je veux un site ou des vidéos qui retiennent.")}`
  : `https://wa.me/?text=${encodeURIComponent("Bonjour Septim, je veux un site ou des vidéos qui retiennent.")}`;

// Pas de footer de fin : les mentions légales restent à un clic, dans l'en-tête.
export function SiteHeader() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-nuit via-nuit/85 to-transparent p-4 pb-8 md:px-6">
      <a href="#top" className="font-display text-2xl font-black [font-stretch:130%]">
        Septim
      </a>
      <nav className="flex items-center gap-2">
        <button type="button" onClick={() => dialog.current?.showModal()} className="rounded-full px-4 py-2 text-sm text-brume hover:text-craie">
          Mentions
        </button>
        <a href={WHATSAPP_URL} className="rounded-full bg-camwood px-5 py-2.5 text-sm font-semibold text-craie hover:bg-[#d4553a]">
          Écrire sur WhatsApp
        </a>
      </nav>
      <dialog ref={dialog} className="m-auto max-w-lg rounded-[1.5rem] bg-craie p-8 text-nuit backdrop:bg-nuit/70">
        <h2 className="font-display text-2xl font-black">Mentions légales</h2>
        <p className="mt-4">Septim, studio de sites et de vidéos, Yaoundé, Cameroun. Contact via WhatsApp.</p>
        <p className="mt-2">Ce site ne dépose aucun cookie publicitaire. Le son ne démarre que si tu l&apos;actives.</p>
        <form method="dialog" className="mt-6">
          <button className="rounded-full bg-nuit px-5 py-2.5 text-sm font-semibold text-craie">Fermer</button>
        </form>
      </dialog>
    </header>
  );
}
