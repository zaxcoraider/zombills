// A 16 px strip of grass and earth: the line tombstones stand on. Tokens only, no images.

import { useId } from "react";
import { GROUND_TOP } from "./graveyard-backdrop";

/** Height of the strip in CSS px. */
export const GROUND_LINE_H = 16;

export interface GroundLineProps {
  /** Extra layout classes, for example `-mx-2` under a tombstone grid. */
  className?: string;
}

export function GroundLine({ className = "" }: GroundLineProps) {
  const id = useId();
  return (
    <svg
      data-ground-line=""
      className={`pointer-events-none block w-full ${className}`}
      style={{ height: GROUND_LINE_H }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={id} width="48" height={GROUND_LINE_H} patternUnits="userSpaceOnUse">
          <path
            style={{ fill: GROUND_TOP }}
            d="M4 8l1.5-6 1.2 6Zm2.4 0 2.6-7.5L9.4 8Zm16 0 1.2-5 1.4 5Zm2.2 0 2.4-6.5L27 8Zm14 0 1-4.5 1.4 4.5Z"
          />
        </pattern>
      </defs>
      <rect width="100%" height="8" fill={`url(#${id})`} />
      <rect y="8" width="100%" height="8" style={{ fill: GROUND_TOP }} />
      <rect y="8" width="100%" height="1" style={{ fill: "var(--bone)", fillOpacity: 0.14 }} />
    </svg>
  );
}
