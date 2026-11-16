// Decides between the system share sheet and a file download, and makes the share call
// (share-card Req 5.1–5.5). Nothing here is logged, stored or sent beyond navigator.share.

import { SHARE_TITLE } from "../logic/share-card-text";

export type SharePath = "share" | "save";

/** At runtime, either member may be missing. */
export type ShareNavigator = Partial<Pick<Navigator, "share" | "canShare">>;

/** Req 5.1. Never throws. */
export function sharePathFor(nav: ShareNavigator | undefined, file: File): SharePath {
  if (nav === undefined || typeof nav.share !== "function" || typeof nav.canShare !== "function") {
    return "save";
  }
  try {
    return nav.canShare({ files: [file] }) === true ? "share" : "save";
  } catch {
    return "save";
  }
}

export interface ShareHandlers {
  shared(): void;
  /** Any rejection other than AbortError, or a synchronous throw. */
  failed(): void;
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

/** Req 5.2–5.5. Calls nav.share synchronously; never throws. */
export function shareImage(nav: ShareNavigator, file: File, handlers: ShareHandlers): void {
  let pending: Promise<void> | undefined;
  try {
    // First statement of the click: nothing is awaited before it, so user activation holds.
    // Called through the object so `this` stays the navigator.
    pending = nav.share!({ files: [file], title: SHARE_TITLE });
  } catch {
    handlers.failed();
    return;
  }
  Promise.resolve(pending).then(
    () => handlers.shared(),
    (error: unknown) => {
      if (!isAbortError(error)) handlers.failed();
    },
  );
}

/** navigator, or undefined where there is none. */
export function currentNavigator(): ShareNavigator | undefined {
  return typeof navigator === "undefined" ? undefined : navigator;
}
