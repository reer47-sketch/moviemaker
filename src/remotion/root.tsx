import { Composition } from "remotion";
import { VideoComposition } from "./VideoComposition";

export const RemotionRoot = () => {
  return (
    <Composition
      id="VideoComposition"
      component={VideoComposition}
      durationInFrames={900} // Default, overridden by inputProps
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        scenes: [],
        audioUrl: "",
      }}
    />
  );
};
