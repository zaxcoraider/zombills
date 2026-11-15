import { useEffect } from "react";
import type { Dispatch } from "react";
import type { PageAction, RisingStage } from "../page-state";
import { BURIAL_FALLBACK_MS } from "./motion";

/**
 * Ends a burial that an animation callback never finished (Req 13.6). The timer is keyed on
 * the burying id, not the phase, so the whole sequence has one budget. The reducer ignores
 * `burial-finish` when the sequence already ended.
 */
export function useBurialFallback(stage: RisingStage | null, dispatch: Dispatch<PageAction>): void {
  const buryingId = stage?.kind === "burying" ? stage.id : null;
  useEffect(() => {
    if (buryingId === null) return;
    const timer = setTimeout(() => {
      dispatch({ type: "burial-finish", id: buryingId });
    }, BURIAL_FALLBACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [buryingId, dispatch]);
}
