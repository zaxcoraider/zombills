// The night scene behind every Page state: sky, moon and fog. Decorative only.
// Unlike the Spike's h-svh box, the page scrolls over a backdrop fixed to the viewport. The ridge
// band and the earth are drawn in the document flow by the page, so they scroll with it.

import type { CSSProperties, ReactNode } from "react";
import { BackdropLayers, ForegroundFog, LANDING_SKY_BACKGROUND } from "./graveyard-backdrop";

// The page background is plain night; the sky lives on the fixed layer and ends in night.
const SCENE_STYLE = {
  // Height of the earth band. Everything that rises or sinks is measured from its top edge.
  "--ground-h": "clamp(7rem, 24svh, 15rem)",
  background: "var(--night)",
} as CSSProperties;

const SKY_STYLE = { background: LANDING_SKY_BACKGROUND } as CSSProperties;

const VIGNETTE =
  "radial-gradient(ellipse 85% 80% at 50% 55%, transparent 55%, color-mix(in oklab, var(--night) 70%, transparent) 100%)";

export interface NightSceneProps {
  fogCleared: boolean;
  reduceMotion: boolean;
  /** The Landing view. The scene is the same on every view; the page lays out its own ridge. */
  landing: boolean;
  /** Draws the fixed sky moon (the Landing view draws its own inside the Banner). */
  skyMoon: boolean;
  children: ReactNode;
}

export function NightScene({ fogCleared, reduceMotion, skyMoon, children }: NightSceneProps) {
  return (
    <div className="relative isolate min-h-svh text-bone" style={SCENE_STYLE}>
      <div className="pointer-events-none fixed inset-0" aria-hidden="true" style={SKY_STYLE}>
        <BackdropLayers
          reduceMotion={reduceMotion}
          fogCleared={fogCleared}
          moon={skyMoon}
          ridge={false}
        />
      </div>
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <ForegroundFog reduceMotion={reduceMotion} fogCleared={fogCleared} />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{ background: VIGNETTE }}
      />
      <div className="relative isolate overflow-clip">{children}</div>
    </div>
  );
}
