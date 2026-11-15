// Timing helpers that let the browser paint the "working" state before heavy work starts.

/** Resolves on the next requestAnimationFrame callback. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Resolves on a setTimeout(…, 0) callback. */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
