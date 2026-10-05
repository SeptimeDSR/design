"use client";

import dynamic from "next/dynamic";

const SplineScene = dynamic(() => import("@splinetool/react-spline"), { ssr: false });
const OrbScene = dynamic(() => import("./orb-scene"), { ssr: false });

const splineScene = process.env.NEXT_PUBLIC_SPLINE_SCENE;

// PRO (option) : scène Spline interactive. Spline = plan Free OK, Starter $15/mois
// pour retirer le logo. La scène se crée dans l'app desktop Spline (MCP intégré).
// FREE : <OrbScene /> en react-three-fiber, s'affiche tant que NEXT_PUBLIC_SPLINE_SCENE est vide.
export function HeroScene({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      {splineScene ? <SplineScene scene={splineScene} /> : <OrbScene />}
    </div>
  );
}
