import { describe, expect, it } from "vitest";
import { whatsappUrl } from "../whatsapp";

describe("whatsappUrl", () => {
  it("ouvre la conversation avec Septim quand le numéro est configuré, même saisi avec + et espaces", () => {
    const url = whatsappUrl("+237 6 99 00 11 22");
    expect(url.startsWith("https://wa.me/237699001122?text=")).toBe(true);
  });

  it("préremplit le message de contact", () => {
    expect(decodeURIComponent(whatsappUrl("237699001122").split("text=")[1])).toBe("Bonjour Septim, je veux un site ou des vidéos qui retiennent.");
  });

  it("sans numéro, reste un lien de partage valide au lieu d'un lien cassé", () => {
    expect(whatsappUrl(undefined).startsWith("https://wa.me/?text=")).toBe(true);
    expect(whatsappUrl("  ").startsWith("https://wa.me/?text=")).toBe(true);
  });
});
