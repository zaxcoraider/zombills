import { useEffect, useState } from "react";

const HOVER_NONE_QUERY = "(hover: none)";

function matchHoverNone(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(HOVER_NONE_QUERY);
}

/** True when the primary pointer cannot hover (touch). False when `matchMedia` is missing. */
export function useHoverNone(): boolean {
  const [hoverNone, setHoverNone] = useState(() => matchHoverNone()?.matches ?? false);
  useEffect(() => {
    const query = matchHoverNone();
    if (!query) return;
    const update = () => setHoverNone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return hoverNone;
}
