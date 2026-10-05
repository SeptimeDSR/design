const MESSAGE = "Bonjour Septim, je veux un site ou des vidéos qui retiennent.";

// Sans numéro, wa.me ouvre le choix du contact : le lien marche, mais n'arrive pas chez Septim.
// Renseigner NEXT_PUBLIC_WHATSAPP_NUMBER (le build le rappelle s'il manque).
export function whatsappUrl(number: string | undefined): string {
  const digits = number?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(MESSAGE)}`;
}

export const WHATSAPP_URL = whatsappUrl(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);
