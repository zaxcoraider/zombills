import { decodeStore, type ReadResult } from "../logic/graveyard-codec.ts";

/** The one key this app reads or writes (Req 3.6). */
export const STORE_KEY = "zombills.graveyard.v1";

export interface StoreLoad {
  result: ReadResult;
  /** The raw string for an `ok` result, `null` otherwise. */
  text: string | null;
}

export const EMPTY_STORE_LOAD: StoreLoad = { result: { kind: "empty" }, text: null };

export interface StoreTarget {
  /** May throw (SecurityError). */
  storage: () => Storage;
  /** Called inside onRemovedElsewhere, never when the module loads. */
  events: () => Pick<Window, "addEventListener" | "removeEventListener">;
}

export interface GraveyardStore {
  /** One getItem, then decodeStore. A Storage failure gives EMPTY_STORE_LOAD (Req 5.1). */
  load(): StoreLoad;
  /** One setItem. false on a Storage failure. */
  write(text: string): boolean;
  /** One removeItem. false on a Storage failure. */
  remove(): boolean;
  /** Req 3.9. Returns the unsubscribe function. */
  onRemovedElsewhere(listener: () => void): () => void;
}

const DEFAULT_TARGET: StoreTarget = {
  storage: () => window.localStorage,
  events: () => window,
};

export function createGraveyardStore(target: StoreTarget = DEFAULT_TARGET): GraveyardStore {
  return {
    load() {
      try {
        const text = target.storage().getItem(STORE_KEY);
        const result = decodeStore(text);
        return { result, text: result.kind === "ok" ? text : null };
      } catch {
        return EMPTY_STORE_LOAD;
      }
    },
    write(text) {
      try {
        target.storage().setItem(STORE_KEY, text);
        return true;
      } catch {
        return false;
      }
    },
    remove() {
      try {
        target.storage().removeItem(STORE_KEY);
        return true;
      } catch {
        return false;
      }
    },
    onRemovedElsewhere(listener) {
      const events = target.events();
      const handler = (event: StorageEvent): void => {
        if ((event.key === STORE_KEY && event.newValue === null) || event.key === null) listener();
      };
      events.addEventListener("storage", handler as EventListener);
      return () => {
        events.removeEventListener("storage", handler as EventListener);
      };
    },
  };
}

/** Default instance; touches nothing until a method is called. */
export const graveyardStore: GraveyardStore = createGraveyardStore();
