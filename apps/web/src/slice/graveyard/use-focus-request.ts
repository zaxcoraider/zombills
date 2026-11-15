import { createContext, useCallback, useContext } from "react";
import type { FocusRequest } from "../page-state";

export interface FocusRequestValue {
  /** The page's current request, or null before the first one */
  focus: FocusRequest | null;
  /** True once for each `seq` newer than every handled one; false after that */
  claim: (seq: number) => boolean;
}

export const FocusRequestContext = createContext<FocusRequestValue>({
  focus: null,
  claim: () => false,
});

/** The `data-focus` key a request names: `target`, or `target:id` when it has an id. */
export function focusKey(request: FocusRequest): string {
  return request.id === null ? request.target : `${request.target}:${request.id}`;
}

/**
 * Focus `element` without the browser's own scroll, then scroll so what the user must read is
 * on screen: the whole burial stage when the element is inside one (its top edge at the top of
 * the viewport, so the whole card shows), otherwise the element itself. Smooth scrolling is
 * skipped under reduced motion.
 */
export function focusAndReveal(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  const stage = element.closest<HTMLElement>("[data-burial-stage]");
  const target = stage ?? element;
  if (typeof target.scrollIntoView !== "function") return;
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: stage === null ? "nearest" : "start",
    inline: "nearest",
  });
}

/**
 * A ref callback for a focus target. It sets `data-focus={key}` and focuses the element when
 * it mounts (or when a new request arrives) while the request names `key` and its `seq` has
 * not been handled yet.
 */
export function useFocusRequest(key: string): (element: HTMLElement | null) => void {
  const { focus, claim } = useContext(FocusRequestContext);
  return useCallback(
    (element: HTMLElement | null) => {
      if (element === null) return;
      element.dataset.focus = key;
      if (focus !== null && focusKey(focus) === key && claim(focus.seq)) {
        focusAndReveal(element);
      }
    },
    [key, focus, claim],
  );
}
