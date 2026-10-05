import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/instrument-serif";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { HeroShot, heroShotConfig } from "./compositions/HeroShot";
import { CinematicDolly, cinematicDollyConfig } from "./compositions/CinematicDolly";
import { ViralStory } from "./viral/ViralStory";
import { ViralMaths } from "./viral/ViralMaths";
import { ViralFilm } from "./viral/ViralFilm";
import { durationInFrames, VIRAL_FPS, VIRAL_HEIGHT, VIRAL_WIDTH, type ViralProps } from "./viral/props";
import { sampleProps } from "./viral/sample";

// La durée suit la voix : timeline réelle du TTS (rendu) ou estimée (Studio).
const viralMetadata: CalculateMetadataFunction<ViralProps> = ({ props }) => ({
  durationInFrames: durationInFrames(props.timeline),
});

export function RemotionRoot() {
  return (
    <>
      <Composition id="hero-shot" component={HeroShot} {...heroShotConfig} defaultProps={{}} />
      <Composition id="cinematic-dolly" component={CinematicDolly} {...cinematicDollyConfig} defaultProps={{}} />
      <Composition
        id="viral-story"
        component={ViralStory}
        fps={VIRAL_FPS}
        width={VIRAL_WIDTH}
        height={VIRAL_HEIGHT}
        durationInFrames={900}
        defaultProps={sampleProps("story")}
        calculateMetadata={viralMetadata}
      />
      <Composition
        id="viral-maths"
        component={ViralMaths}
        fps={VIRAL_FPS}
        width={VIRAL_WIDTH}
        height={VIRAL_HEIGHT}
        durationInFrames={900}
        defaultProps={sampleProps("maths", "le prix de ton forfait internet")}
        calculateMetadata={viralMetadata}
      />
      <Composition
        id="viral-film"
        component={ViralFilm}
        fps={VIRAL_FPS}
        width={VIRAL_WIDTH}
        height={VIRAL_HEIGHT}
        durationInFrames={900}
        defaultProps={sampleProps("film", "la reine Njinga")}
        calculateMetadata={viralMetadata}
      />
    </>
  );
}
