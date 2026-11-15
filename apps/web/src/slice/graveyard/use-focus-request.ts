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
        element.focus({ preventScroll: false });
      }
    },
    [key, focus, claim],
  );
}
