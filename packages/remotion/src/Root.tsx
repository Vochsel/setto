import React from "react";
import { Composition } from "remotion";
import { Timeline, calculateTimelineMetadata } from "./Timeline";
import {
  DEFAULT_TEMPLATE_ID,
  getResolution,
  type VideoSpec,
} from "@setto/core/video";

/** A tiny placeholder spec so the Studio/Player has something to show. */
const SAMPLE_SPEC: VideoSpec = (() => {
  const res = getResolution("1080x1920");
  return {
    templateId: DEFAULT_TEMPLATE_ID,
    width: res.width,
    height: res.height,
    fps: 30,
    background: "#000000",
    clips: [
      {
        id: "sample",
        sourceType: "image",
        url: "https://picsum.photos/seed/setto/1080/1920",
        durationMs: 2500,
        effect: { type: "none" },
        transition: { type: "none", durationMs: 0 },
      },
    ],
  };
})();

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Timeline"
      component={Timeline}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={SAMPLE_SPEC}
      calculateMetadata={calculateTimelineMetadata}
    />
  );
};
