// The night scene behind every Page state: sky, moon, fog and ground. Decorative only.
// Unlike the Spike's h-svh box, the page scrolls over a backdrop fixed to the viewport.

import type { CSSProperties, ReactNode } from "react";
import { BackdropLayers, ForegroundFog, Ground, SKY_BACKGROUND } from "./graveyard-backdrop";

const SCENE_STYLE = {
  // Height of the earth band. Everything that rises or sinks is measured from its top edge.
  "--ground-h": "clamp(7rem, 24svh, 15rem)",
  background: SKY_BACKGROUND,
} as CSSProperties;

const VIGNETTE =
  "radial-gradient(ellipse 85% 80% at 50% 55%, transparent 55%, color-mix(in oklab, var(--night) 70%, transparent) 100%)";

export interface NightSceneProps {
  fogCleared: boolean;
  reduceMotion: boolean;
  /** The Landing view draws its own moon inside the Banner and keeps the fog still. */
  landing: boolean;
  children: ReactNode;
}

export function NightScene({ fogCleared, reduceMotion, landing, children }: NightSceneProps) {
  const fogStill = reduceMotion || landing;
  return (
    <div className="relative isolate min-h-svh text-bone" style={SCENE_STYLE}>
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <BackdropLayers
          reduceMotion={reduceMotion}
          fogCleared={fogCleared}
          fogStill={fogStill}
          moon={!landing}
        />
      </div>
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <Ground />
        <ForegroundFog reduceMotion={reduceMotion} fogCleared={fogCleared} fogStill={fogStill} />
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
