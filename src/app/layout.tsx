import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { SmoothScroll } from "@/components/providers/smooth-scroll";

export const metadata: Metadata = {
  title: "Septim — Design Stack 2026",
  description: "Lenis, GSAP, Motion, Spline, Remotion : la stack qui retient, en version FREE et PRO.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="antialiased">
      <body className="min-h-screen bg-ink text-bone">
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
