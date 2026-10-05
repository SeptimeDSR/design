import type { Metadata } from "next";
import "@fontsource-variable/anybody/wdth.css";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import { SoundProvider } from "@/components/retention/sound";

export const metadata: Metadata = {
  title: "Septim — sites et vidéos qu'on n'arrive pas à quitter",
  description: "Studio à Yaoundé. Sites immersifs et vidéos courtes conçus pour être regardés jusqu'au bout.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="antialiased">
      <body className="min-h-screen bg-nuit text-craie">
        <SoundProvider>
          <SmoothScroll>{children}</SmoothScroll>
        </SoundProvider>
      </body>
    </html>
  );
}
