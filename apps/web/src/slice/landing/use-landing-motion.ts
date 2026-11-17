import { useEffect, useState } from "react";

let played = false;

export type LandingMotion = "play" | "still";

/**
 * The Landing effects play once per page load. The first Landing view to mount reads `"play"`;
 * every later one (after "Start again" or "Back to the start") reads `"still"`. Components that
 * mount in the same commit all read the same value, because the flag is set in an effect.
 */
export function useLandingMotion(): LandingMotion {
  const [motion] = useState<LandingMotion>(() => (played ? "still" : "play"));
  useEffect(() => {
    played = true;
  }, []);
  return motion;
}
