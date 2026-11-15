import { useEffect, useState } from "react";

export type Route = "page" | "spike";

/** "#spike" → "spike"; anything else, including no hash → "page" (Req 1.1–1.3). */
export function routeFromHash(hash: string): Route {
  return hash === "#spike" ? "spike" : "page";
}

/** Reads location.hash on mount and on every `hashchange`; removes the listener on unmount. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const update = () => setRoute(routeFromHash(window.location.hash));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return route;
}
