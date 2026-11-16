// The live region's write channel. SlicePage owns the region and provides `announce`;
// a component outside a provider (a unit test) gets a function that does nothing.

import { createContext, useContext } from "react";

export interface AnnounceValue {
  announce(text: string): void;
}

export const AnnounceContext = createContext<AnnounceValue>({
  announce() {
    // Default: no live region to write to.
  },
});

export function useAnnounce(): (text: string) => void {
  return useContext(AnnounceContext).announce;
}
