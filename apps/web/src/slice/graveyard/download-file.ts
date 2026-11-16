// Default file download for the Share panel (share-card Req 5.6, 5.7). The blob: URL is used
// only as the href of a temporary anchor; it is never logged, stored or sent (Req 6.3).

export const REVOKE_AFTER_MS = 1000;

/** At most one live object URL (Req 5.7). */
let liveUrl: string | null = null;

/** Req 5.6, 5.7. Holds at most one live object URL. */
export function downloadFile(file: File, name: string): void {
  if (liveUrl !== null) {
    URL.revokeObjectURL(liveUrl);
    liveUrl = null;
  }
  const url = URL.createObjectURL(file);
  liveUrl = url;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (liveUrl === url) liveUrl = null;
  }, REVOKE_AFTER_MS);
}
