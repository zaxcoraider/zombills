import { decodeStore } from "../logic/graveyard-codec.ts";
import type { StoreLoad, StoreTarget } from "./graveyard-store.ts";

export interface StorageCall {
  method: "getItem" | "setItem" | "removeItem" | "clear" | "key";
  args: string[];
}

export interface FakeStorage extends Storage {
  /** Every call, in order. */
  calls: StorageCall[];
  /** Direct read for assertions; not logged. */
  peek(key: string): string | null;
  /** When true, a target built on this storage throws from `storage()`. */
  getterThrows: boolean;
}

export interface FakeStorageOptions {
  throwOn?: { get?: boolean; set?: boolean; remove?: boolean; getter?: boolean };
  /** Initial contents, written without logging. */
  initial?: Record<string, string>;
}

function domError(name: "QuotaExceededError" | "SecurityError"): DOMException {
  return new DOMException(name, name);
}

export interface FakeStoreTarget extends StoreTarget {
  storage: () => FakeStorage;
  /** Dispatches a synthetic StorageEvent to the registered listeners. */
  dispatchRemoval(key: string | null, newValue: string | null): void;
  /** Number of `storage` listeners currently registered. */
  listenerCount(): number;
  /** How many times `storage()` was called. */
  storageReads(): number;
}

export function fakeStorage(options: FakeStorageOptions = {}): FakeStorage {
  const { throwOn = {}, initial = {} } = options;
  const data = new Map<string, string>(Object.entries(initial));
  const calls: StorageCall[] = [];
  const storage: FakeStorage = {
    calls,
    getterThrows: throwOn.getter === true,
    peek: (key) => data.get(key) ?? null,
    get length() {
      return data.size;
    },
    getItem(key) {
      calls.push({ method: "getItem", args: [key] });
      if (throwOn.get) throw domError("SecurityError");
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      calls.push({ method: "setItem", args: [key, value] });
      if (throwOn.set) throw domError("QuotaExceededError");
      data.set(key, value);
    },
    removeItem(key) {
      calls.push({ method: "removeItem", args: [key] });
      if (throwOn.remove) throw domError("SecurityError");
      data.delete(key);
    },
    clear() {
      calls.push({ method: "clear", args: [] });
      data.clear();
    },
    key(index) {
      calls.push({ method: "key", args: [String(index)] });
      return [...data.keys()][index] ?? null;
    },
  };
  return storage;
}

export function fakeStoreTarget(storage: FakeStorage): FakeStoreTarget {
  const events = new EventTarget();
  const listeners = new Set<EventListenerOrEventListenerObject>();
  let reads = 0;
  const surface = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject): void => {
      listeners.add(listener);
      events.addEventListener(type, listener);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject): void => {
      listeners.delete(listener);
      events.removeEventListener(type, listener);
    },
  };
  return {
    storage: () => {
      reads += 1;
      if (storage.getterThrows) throw domError("SecurityError");
      return storage;
    },
    events: () => surface,
    dispatchRemoval(key, newValue) {
      events.dispatchEvent(new StorageEvent("storage", { key, newValue }));
    },
    listenerCount: () => listeners.size,
    storageReads: () => reads,
  };
}

/** Decodes `text` into a StoreLoad the way `load` does. */
export function storeLoadOf(text: string | null): StoreLoad {
  const result = decodeStore(text);
  return { result, text: result.kind === "ok" ? text : null };
}
