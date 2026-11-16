// A renderShareCard mock for component tests. Imported only by tests, never by the app.
// It imports only vitest and types, so a `vi.mock` factory can load it without loading the app.
import { vi } from "vitest";
import type { ShareCardContent } from "../logic/share-card";
import type { RenderedShareCard } from "./share-card-renderer";

interface Deferred {
  resolve(result: RenderedShareCard): void;
  reject(): void;
}

const deferreds: Deferred[] = [];
const calls: unknown[][] = [];

const render = vi.fn((...args: unknown[]): Promise<RenderedShareCard> => {
  calls.push(args);
  return new Promise<RenderedShareCard>((resolve, reject) => {
    deferreds.push({ resolve, reject: () => reject(new Error("share-card: drawing failed")) });
  });
});

function deferredAt(index: number): Deferred {
  const deferred = deferreds[index];
  if (deferred === undefined) throw new Error(`no render call ${index}`);
  return deferred;
}

export const renderControl = {
  render,
  /** The arguments of every call, in order */
  get calls(): readonly (readonly unknown[])[] {
    return calls;
  },
  /** The Share content each call was made with */
  contentAt(index: number): ShareCardContent {
    return calls[index]?.[0] as ShareCardContent;
  },
  resolveRender(index: number, result: RenderedShareCard): void {
    deferredAt(index).resolve(result);
  },
  rejectRender(index: number): void {
    deferredAt(index).reject();
  },
  /** A fake result whose dataUrl is unique per label */
  fakeResult(label: string): RenderedShareCard {
    return {
      dataUrl: `data:image/png;base64,${label}`,
      file: new File([label], "zombills-graveyard.png", { type: "image/png" }),
    };
  },
  reset(): void {
    deferreds.length = 0;
    calls.length = 0;
    render.mockClear();
  },
};
