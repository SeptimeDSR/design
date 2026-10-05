import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
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
