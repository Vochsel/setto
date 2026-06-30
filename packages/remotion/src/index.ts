import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);

export { Timeline, calculateTimelineMetadata } from "./Timeline";
export { RemotionRoot } from "./Root";

/** The composition id used by the Lambda render trigger. */
export const TIMELINE_COMPOSITION_ID = "Timeline";
