import type { NextConfig } from "next";

// Le bouton « Écrire sur WhatsApp » n'arrive chez toi que si ton numéro est renseigné.
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim()) {
  console.warn("⚠ NEXT_PUBLIC_WHATSAPP_NUMBER est vide : les boutons WhatsApp ouvriront le choix du contact. Ajoute ton numéro (ex. 2376XXXXXXXX) dans .env.local.");
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
