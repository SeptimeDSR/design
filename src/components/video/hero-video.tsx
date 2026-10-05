"use client";

import { Player } from "@remotion/player";
import { HeroShot, heroShotConfig } from "@/remotion/compositions/HeroShot";

const proVideo = process.env.NEXT_PUBLIC_HERO_VIDEO_URL;

export function HeroVideo({ className }: { className?: string }) {
  if (proVideo) {
    // BESOIN CREDIT: Higgsfield Seedance pour cette vidéo (ou Runway Gen-4.5 / Pika).
    // Générée via /hero-shot avec le MCP higgsfield, puis déposée dans /public/videos.
    // Alternative gratuite: Remotion <Player> installé ici (branche ci-dessous).
    return (
      <video
        className={className}
        src={proVideo}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }

  // FREE — vidéo 100% code avec Remotion, 0 crédit. Rendu MP4 : npm run video:render
  return (
    <Player
      className={className}
      component={HeroShot}
      durationInFrames={heroShotConfig.durationInFrames}
      fps={heroShotConfig.fps}
      compositionWidth={heroShotConfig.width}
      compositionHeight={heroShotConfig.height}
      autoPlay
      loop
      controls={false}
      style={{ width: "100%", aspectRatio: `${heroShotConfig.width} / ${heroShotConfig.height}` }}
    />
  );
}
