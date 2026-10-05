// Importe ici les polices du projet pour le rendu MP4 (ex. import "@fontsource-variable/<police>";).
import { Composition } from "remotion";
import { HeroShot, heroShotConfig } from "./compositions/HeroShot";
import { CinematicDolly, cinematicDollyConfig } from "./compositions/CinematicDolly";

export function RemotionRoot() {
  return (
    <>
      <Composition id="hero-shot" component={HeroShot} {...heroShotConfig} defaultProps={{}} />
      <Composition id="cinematic-dolly" component={CinematicDolly} {...cinematicDollyConfig} defaultProps={{}} />
    </>
  );
}
