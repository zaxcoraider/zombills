// @vitest-environment jsdom
// Page flows for graveyard-memory (Req 11.3): every Phase A case, rendered through `<App>` with a
// fake store. No test uses the default store, and no test renders inside Strict Mode.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { expectUniqueButtonNames } from "./graveyard/test-a11y";
import { formatMoney } from "./logic/money";
import { PRIMARY_ACTION_NAME } from "./logic/landing-text";
import {
  CARRIED_OVER_NOTE,
  EARLIER_NOTE,
  FORGET_BUTTON,
  FORGET_CANCEL,
  FORGET_CONFIRM,
  FORGET_QUESTION,
  FORGOTTEN,
  MEMORY_HINT,
  MEMORY_KEPT,
  MEMORY_LABEL,
  MEMORY_NOT_KEPT,
  MEMORY_NOT_KEPT_REMOVE_FAILED,
  MEMORY_ON_LINE,
  MEMORY_SHORT,
  NEWER_NOTE,
  REMOVE_FAILED_NOTE,
  UNREADABLE_NOTE,
  WRITE_FAILED_NOTE,
  PRIVACY_NOTE,
  STATEMENT_TIP,
  carriedOverLine,
  droppedNote,
  restoredLine,
} from "./logic/memory-text";
import { WHAT_IS_KEPT } from "./logic/chrome-text";
import { EMPTY_STORE_LOAD, STORE_KEY, createGraveyardStore } from "./storage/graveyard-store";
import type { StoreLoad } from "./storage/graveyard-store";
import { fakeStorage, fakeStoreTarget, storeLoadOf } from "./storage/test-store";
import type { FakeStorage, FakeStorageOptions, FakeStoreTarget } from "./storage/test-store";

// The reduced-motion test flips this; every other test runs with full motion settings.
const reduced = vi.hoisted(() => ({ value: false }));
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => reduced.value };
});

// Records what the entering Tombstone asks for, so the reduced-motion test can read it.
const tombstoneMotionCalls = vi.hoisted(
  () => [] as { reduced: boolean; result: Record<string, unknown> }[],
);
vi.mock("./graveyard/motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./graveyard/motion")>();
  return {
    ...actual,
    tombstoneMotion: (isReduced: boolean) => {
      const result = actual.tombstoneMotion(isReduced);
      tombstoneMotionCalls.push({ reduced: isReduced, result: { ...result } });
      return result;
    },
  };
});

/** The Glossary example: us-signed.csv with Netflix buried. */
const GLOSSARY_TEXT =
  '{"version":1,"records":[{"id":"sub:USD:monthly:*:netflix","merchant":"Netflix","serviceId":"netflix","currentAmountCents":1799,"answer":"not-using","cadenceAssumed":false,"carriedOver":false}]}';

const NETFLIX = {
  id: "sub:USD:monthly:*:netflix",
  merchant: "Netflix",
  serviceId: "netflix",
  currentAmountCents: 1799,
  answer: "not-using",
  cadenceAssumed: false,
  carriedOver: false,
};
const SPOTIFY = {
  id: "sub:USD:monthly:*:spotify",
  merchant: "Spotify",
  serviceId: "spotify",
  currentAmountCents: 1099,
  answer: "not-using",
  cadenceAssumed: false,
  carriedOver: false,
};
const APPLE = {
  id: "sub:USD:monthly:1099:unidentified:apple:apple.com/bill 866-712-7753 ca",
  merchant: "APPLE.COM/BILL 866-712-7753 CA",
  serviceId: null,
  currentAmountCents: 1099,
  answer: "not-using",
  cadenceAssumed: false,
  carriedOver: false,
};
const STORED_KEYS = [
  "answer",
  "cadenceAssumed",
  "carriedOver",
  "currentAmountCents",
  "id",
  "merchant",
  "serviceId",
];

function storeText(...records: object[]): string {
  return JSON.stringify({ version: 1, records });
}

const logged: { method: "error" | "warn" | "log"; args: unknown[] }[] = [];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  window.location.hash = "";
  reduced.value = false;
  tombstoneMotionCalls.length = 0;
  logged.length = 0;
  for (const method of ["error", "warn", "log"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push({ method, args });
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  expect(logged).toEqual([]);
});

interface Rig {
  storage: FakeStorage;
  target: FakeStoreTarget;
}

interface MountOptions {
  /** The Store text at the key; `null` for a first visit. */
  text?: string | null;
  storage?: FakeStorageOptions;
  /** Read the Store through `store.load()`, as `main.tsx` does, instead of `storeLoadOf`. */
  throughLoad?: boolean;
}

function mount(options: MountOptions = {}): Rig {
  const { text = null, storage: storageOptions = {}, throughLoad = false } = options;
  const storage = fakeStorage({
    ...storageOptions,
    initial: text === null ? {} : { [STORE_KEY]: text },
  });
  const target = fakeStoreTarget(storage);
  const store = createGraveyardStore(target);
  let initialStore: StoreLoad = text === null ? EMPTY_STORE_LOAD : storeLoadOf(text);
  if (throughLoad) initialStore = store.load();
  render(<App store={store} initialStore={initialStore} />);
  return { storage, target };
}

function methodCalls(storage: FakeStorage, method: string) {
  return storage.calls.filter((call) => call.method === method);
}

function storedRecords(storage: FakeStorage): Record<string, unknown>[] {
  const text = storage.peek(STORE_KEY);
  if (text === null) throw new Error("no Store at the key");
  return (JSON.parse(text) as { records: Record<string, unknown>[] }).records;
}

function liveRegion(): HTMLElement {
  return screen.getByRole("status");
}

function checkbox(): HTMLInputElement {
  return screen.getByRole("checkbox", { name: MEMORY_LABEL });
}

/** The Memory panel, apart from the Live region that repeats its notes. */
function memoryPanel(): HTMLElement {
  const section = screen.getByRole("heading", { level: 3, name: "Memory" }).closest("section");
  if (section === null) throw new Error("no Memory panel");
  return section;
}

function counterText(): string {
  return within(screen.getByRole("group", { name: "Saved per year" })).getByText(
    (_content, element) => element?.classList.contains("sr-only") === true,
  ).textContent as string;
}

function cardHeading(name: string): HTMLElement {
  return screen.getByRole("heading", { level: 3, name });
}

async function chooseSample() {
  fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
  await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
}

/** Skips Adobe and Riverside Gym so Netflix is the card on screen. */
function reachNetflix() {
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  cardHeading("Riverside Gym Membership");
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  cardHeading("Netflix");
}

async function buryNetflix() {
  reachNetflix();
  fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
  await screen.findByRole("region", { name: "Here lies Netflix." });
}

async function openGraveyard() {
  fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
  const heading = screen.getByRole("heading", { level: 2, name: "Your graveyard" });
  await waitFor(() => expect(document.activeElement).toBe(heading));
}

/** The Rising, Graveyard view, counter and Share panel all work (Req 5.5). */
async function expectPageWorks(buried: number) {
  expect(counterText()).toBe(formatMoney(buried, "USD"));
  expect(screen.getByRole("heading", { level: 3, name: "Share your graveyard" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Make an image" })).toBeTruthy();
  expectUniqueButtonNames(document.body);
  fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
  expect(screen.getByRole("heading", { level: 2, name: "Recurring charges found" })).toBeTruthy();
  await openGraveyard();
}

describe("graveyard memory flow: first visit", () => {
  it("shows an unticked checkbox, the hint and the new idle sentence, and makes no storage call", async () => {
    const { storage } = mount();
    expect(screen.getAllByText(PRIVACY_NOTE)).toHaveLength(1);
    expect(screen.getAllByText(STATEMENT_TIP)).toHaveLength(1);

    await chooseSample();
    reachNetflix();
    fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
    await screen.findByRole("region", { name: "Here lies Netflix." });
    await openGraveyard();

    expect(checkbox().checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: WHAT_IS_KEPT }));
    const hint = screen.getByText(MEMORY_HINT);
    const short = screen.getByText(MEMORY_SHORT);
    expect(checkbox().getAttribute("aria-describedby")).toBe(`${short.id} ${hint.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
    await openGraveyard();
    expect(storage.calls).toEqual([]);
  });
});

describe("graveyard memory flow: tick and untick", () => {
  it("writes the Glossary example after burying Netflix and offers Memory settings", async () => {
    const { storage } = mount();
    await chooseSample();
    await openGraveyard();

    fireEvent.click(checkbox());

    expect(checkbox().checked).toBe(true);
    expect(liveRegion().textContent).toBe(MEMORY_KEPT);
    expect(methodCalls(storage, "setItem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
    await buryNetflix();

    expect(storage.peek(STORE_KEY)).toBe(GLOSSARY_TEXT);
    expect(screen.getByText(MEMORY_ON_LINE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Memory settings" }));
    const box = await screen.findByRole("checkbox", { name: MEMORY_LABEL });
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(screen.getByRole("heading", { level: 2, name: "Your graveyard" })).toBeTruthy();
  });

  it("removes the Store once on untick and keeps the tombstone", async () => {
    const { storage } = mount();
    await chooseSample();
    await buryNetflix();
    await openGraveyard();
    fireEvent.click(checkbox());
    expect(storage.peek(STORE_KEY)).toBe(GLOSSARY_TEXT);

    fireEvent.click(checkbox());

    expect(checkbox().checked).toBe(false);
    expect(methodCalls(storage, "removeItem")).toHaveLength(1);
    expect(storage.peek(STORE_KEY)).toBeNull();
    expect(screen.getByRole("region", { name: "Here lies Netflix." })).toBeTruthy();
    expect(liveRegion().textContent).toBe(MEMORY_NOT_KEPT);
  });
});

describe("graveyard memory flow: an unidentified Apple record", () => {
  it("shows the hint and stores only the seven fields", async () => {
    const extra = {
      ...APPLE,
      date: "2026-03-02",
      fileName: "statement.csv",
      priceHistory: [{ date: "2026-03-02", amountCents: 1099 }],
    };
    const { storage } = mount({ text: storeText(extra) });

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));

    fireEvent.click(screen.getByRole("button", { name: WHAT_IS_KEPT }));
    expect(screen.getByText(MEMORY_HINT)).toBeTruthy();
    expect(screen.getAllByRole("region", { name: /^Here lies / })).toHaveLength(1);
    const records = storedRecords(storage);
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0] ?? {}).sort()).toEqual(STORED_KEYS);
    const text = storage.peek(STORE_KEY) ?? "";
    expect(text).not.toContain("2026");
    expect(text).not.toContain("statement.csv");
    expect(methodCalls(storage, "setItem")).toHaveLength(1);
  });
});

describe("graveyard memory flow: load with a valid Store", () => {
  it("restores the graveyard, then a statement makes Netflix a Current record", async () => {
    const { storage } = mount({ text: GLOSSARY_TEXT });
    expect(screen.getByText(restoredLine(1, 0))).toBeTruthy();
    expect(storage.calls).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    const stone = screen.getByRole("region", { name: "Here lies Netflix." });
    expect(stone.textContent).toContain(EARLIER_NOTE);
    expect(counterText()).toBe(formatMoney(21588, "USD"));
    fireEvent.click(screen.getByRole("button", { name: "Back to the start" }));

    await chooseSample();

    expect(screen.queryByRole("heading", { level: 3, name: "Netflix" })).toBeNull();
    expect(screen.queryByText(restoredLine(1, 0))).toBeNull();
    await openGraveyard();
    const current = screen.getByRole("region", { name: "Here lies Netflix." });
    expect(current.textContent).not.toContain(EARLIER_NOTE);
    expect(screen.queryByText(EARLIER_NOTE)).toBeNull();
    expect(counterText()).toBe(formatMoney(21588, "USD"));
  });
});

describe("graveyard memory flow: load notes", () => {
  it("shows the unreadable note on idle and removes the Store once", () => {
    const { storage } = mount({ text: "not json" });
    expect(screen.getByText(UNREADABLE_NOTE)).toBeTruthy();
    expect(methodCalls(storage, "removeItem")).toHaveLength(1);
    expect(methodCalls(storage, "setItem")).toHaveLength(0);
    expect(liveRegion().textContent).toBe("");
  });

  it("shows the dropped note on idle and in the Memory panel, and rewrites with Netflix only", async () => {
    const { storage } = mount({ text: storeText(NETFLIX, { id: "oops" }) });
    expect(screen.getByText(droppedNote(1))).toBeTruthy();
    expect(storage.peek(STORE_KEY)).toBe(GLOSSARY_TEXT);
    expect(methodCalls(storage, "setItem")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));

    expect(screen.getByText(droppedNote(1))).toBeTruthy();
    expect(counterText()).toBe(formatMoney(21588, "USD"));
    expect(methodCalls(storage, "setItem")).toHaveLength(1);
  });

  it("shows the newer note on idle and leaves the Store alone", () => {
    const text = JSON.stringify({ version: 2, records: [] });
    const { storage } = mount({ text });
    expect(screen.getByText(NEWER_NOTE)).toBeTruthy();
    expect(storage.calls).toEqual([]);
    expect(storage.peek(STORE_KEY)).toBe(text);
  });

  it("writes nothing for a valid Store equal to its encoding", () => {
    const { storage } = mount({ text: GLOSSARY_TEXT });
    expect(storage.calls).toEqual([]);
  });
});

describe("graveyard memory flow: Req 5.7 storage rows", () => {
  it("Req 5.7 row works and empty: the tick writes, burying Netflix stores it", async () => {
    const { storage } = mount();
    await chooseSample();
    await openGraveyard();

    fireEvent.click(checkbox());
    expect(storage.peek(STORE_KEY)).toBe('{"version":1,"records":[]}');
    expect(liveRegion().textContent).toBe(MEMORY_KEPT);

    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
    await buryNetflix();
    expect(storage.peek(STORE_KEY)).toBe(GLOSSARY_TEXT);
  });

  it("Req 5.7 row window.localStorage getter throws SecurityError: no note, then the write-failed note, then no call", async () => {
    const { storage, target } = mount({
      storage: { throwOn: { getter: true } },
      throughLoad: true,
    });
    expect(screen.queryByText(WRITE_FAILED_NOTE)).toBeNull();
    expect(screen.queryByText(UNREADABLE_NOTE)).toBeNull();
    await chooseSample();
    await openGraveyard();
    expect(screen.queryByText(WRITE_FAILED_NOTE)).toBeNull();

    fireEvent.click(checkbox());

    expect(checkbox().checked).toBe(false);
    expect(within(memoryPanel()).getByText(WRITE_FAILED_NOTE)).toBeTruthy();
    expect(screen.queryByText(REMOVE_FAILED_NOTE)).toBeNull();
    expect(liveRegion().textContent).toBe(WRITE_FAILED_NOTE);
    const reads = target.storageReads();

    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
    await buryNetflix();
    expect(target.storageReads()).toBe(reads);
    expect(storage.calls).toEqual([]);
    await openGraveyard();
    await expectPageWorks(21588);
  });

  it("Req 5.7 row setItem throws QuotaExceededError on the second write: note, Memory off, removeItem tried, tombstone stays", async () => {
    const throwOn = { set: false };
    const { storage } = mount({ storage: { throwOn } });
    await chooseSample();
    await openGraveyard();
    fireEvent.click(checkbox());
    expect(methodCalls(storage, "setItem")).toHaveLength(1);
    expect(methodCalls(storage, "removeItem")).toHaveLength(0);
    throwOn.set = true;
    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));

    await buryNetflix();

    expect(methodCalls(storage, "setItem")).toHaveLength(2);
    expect(methodCalls(storage, "removeItem")).toHaveLength(1);
    await openGraveyard();
    expect(checkbox().checked).toBe(false);
    expect(within(memoryPanel()).getByText(WRITE_FAILED_NOTE)).toBeTruthy();
    expect(screen.queryByText(REMOVE_FAILED_NOTE)).toBeNull();
    expect(screen.getByRole("region", { name: "Here lies Netflix." })).toBeTruthy();
    await expectPageWorks(21588);
  });

  it("Req 5.7 extra row, getItem throws on load: Memory off, no note, the Page works", async () => {
    const { storage } = mount({ storage: { throwOn: { get: true } }, throughLoad: true });
    expect(methodCalls(storage, "getItem")).toHaveLength(1);
    expect(screen.getAllByText(PRIVACY_NOTE)).toHaveLength(1);
    expect(screen.getAllByText(STATEMENT_TIP)).toHaveLength(1);
    expect(screen.queryByText(UNREADABLE_NOTE)).toBeNull();
    await chooseSample();
    await buryNetflix();
    await openGraveyard();
    expect(checkbox().checked).toBe(false);
    expect(methodCalls(storage, "setItem")).toHaveLength(0);
    await expectPageWorks(21588);
  });

  it("Req 5.7 extra row, removeItem throws on untick: the Req 5.3 note and the combined announcement", async () => {
    const throwOn = { remove: false };
    const { storage } = mount({ storage: { throwOn } });
    await chooseSample();
    await buryNetflix();
    await openGraveyard();
    fireEvent.click(checkbox());
    expect(storage.peek(STORE_KEY)).toBe(GLOSSARY_TEXT);
    throwOn.remove = true;

    fireEvent.click(checkbox());

    expect(checkbox().checked).toBe(false);
    expect(within(memoryPanel()).getByText(REMOVE_FAILED_NOTE)).toBeTruthy();
    expect(liveRegion().textContent).toBe(MEMORY_NOT_KEPT_REMOVE_FAILED);
    expect(screen.getByRole("region", { name: "Here lies Netflix." })).toBeTruthy();
    await expectPageWorks(21588);
  });
});

describe("graveyard memory flow: other tabs and failures", () => {
  it("a synthetic StorageEvent removal unticks the checkbox, keeps the Graveyard and calls no storage", async () => {
    const { storage, target } = mount({ text: GLOSSARY_TEXT });
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect(checkbox().checked).toBe(true);

    act(() => {
      target.dispatchRemoval(STORE_KEY, null);
    });

    expect(checkbox().checked).toBe(false);
    expect(screen.getByRole("region", { name: "Here lies Netflix." })).toBeTruthy();
    expect(storage.calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Unbury Netflix" }));
    expect(storage.calls).toEqual([]);
  });

  it("a failing setItem unticks the checkbox and focus stays on it", async () => {
    const user = userEvent.setup();
    mount({ storage: { throwOn: { set: true } } });
    await chooseSample();
    await openGraveyard();

    await user.click(checkbox());

    expect(checkbox().checked).toBe(false);
    expect(within(memoryPanel()).getByText(WRITE_FAILED_NOTE)).toBeTruthy();
    expect(document.activeElement).toBe(checkbox());
  });
});

describe("graveyard memory flow: Earlier records (Req 7.8)", () => {
  it("unburies and buries Netflix after all with the Req 7.8 totals and focus", async () => {
    const { storage } = mount({ text: storeText(NETFLIX, SPOTIFY) });
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));

    const stones = screen.getAllByRole("region", { name: /^Here lies / });
    expect(stones).toHaveLength(2);
    for (const stone of stones) expect(stone.textContent).toContain(EARLIER_NOTE);
    expect(screen.getByText(/You buried/).textContent).toBe(
      `You buried ${formatMoney(34776, "USD")} a year.`,
    );
    expectUniqueButtonNames(document.body);

    fireEvent.click(screen.getByRole("button", { name: "Unbury Netflix" }));

    expect(screen.getByText(/You buried/).textContent).toContain(formatMoney(13188, "USD"));
    const netflix = storedRecords(storage).find((record) => record["id"] === NETFLIX.id);
    expect(netflix?.["answer"]).toBe("still-using");
    const item = within(
      screen.getByRole("heading", { level: 3, name: "Resting" }).closest("section") as HTMLElement,
    )
      .getByText(/Netflix/)
      .closest("li");
    expect(item).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(item));
    expectUniqueButtonNames(document.body);

    fireEvent.click(screen.getByRole("button", { name: "Bury after all Netflix" }));

    expect(screen.getByText(/You buried/).textContent).toContain(formatMoney(34776, "USD"));
    const stone = screen.getByRole("region", { name: "Here lies Netflix." });
    await waitFor(() => expect(document.activeElement).toBe(stone));
    const again = storedRecords(storage).find((record) => record["id"] === NETFLIX.id);
    expect(again?.["answer"]).toBe("not-using");
  });
});

describe("graveyard memory flow: Forget everything", () => {
  it("confirms with Cancel focused, then forgets everything and returns the Queue", async () => {
    const { storage } = mount();
    await chooseSample();
    await buryNetflix();
    await openGraveyard();
    fireEvent.click(checkbox());
    expect(storage.peek(STORE_KEY)).toBe(GLOSSARY_TEXT);

    fireEvent.click(screen.getByRole("button", { name: FORGET_BUTTON }));
    const group = screen.getByRole("group", { name: FORGET_QUESTION });
    const cancel = within(group).getByRole("button", { name: FORGET_CANCEL });
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    fireEvent.keyDown(group, { key: "Escape" });
    const again = screen.getByRole("button", { name: FORGET_BUTTON });
    await waitFor(() => expect(document.activeElement).toBe(again));
    expect(screen.queryByRole("group", { name: FORGET_QUESTION })).toBeNull();

    fireEvent.click(again);
    fireEvent.click(screen.getByRole("button", { name: FORGET_CANCEL }));
    const third = screen.getByRole("button", { name: FORGET_BUTTON });
    await waitFor(() => expect(document.activeElement).toBe(third));
    expect(storage.peek(STORE_KEY)).toBe(GLOSSARY_TEXT);

    fireEvent.click(third);
    fireEvent.click(screen.getByRole("button", { name: FORGET_CONFIRM }));

    expect(screen.getByText("Nothing buried yet.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: /^Here lies / })).toBeNull();
    expect(counterText()).toBe(formatMoney(0, "USD"));
    expect(checkbox().checked).toBe(false);
    expect(storage.peek(STORE_KEY)).toBeNull();
    expect(methodCalls(storage, "clear")).toHaveLength(0);
    expect(storage.calls.every((call) => call.args[0] === STORE_KEY)).toBe(true);
    const heading = screen.getByRole("heading", { level: 2, name: "Your graveyard" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(liveRegion().textContent).toBe(FORGOTTEN);

    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
    expect(screen.getByText("0 of 4 answered")).toBeTruthy();
    expect(cardHeading("Adobe Creative Cloud")).toBeTruthy();
  });
});

describe("graveyard memory flow: reduced motion", () => {
  it("makes the Earlier Bury after all rise animate only opacity", async () => {
    reduced.value = true;
    mount({ text: storeText(NETFLIX) });
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    fireEvent.click(screen.getByRole("button", { name: "Unbury Netflix" }));
    tombstoneMotionCalls.length = 0;

    fireEvent.click(screen.getByRole("button", { name: "Bury after all Netflix" }));

    await screen.findByRole("region", { name: "Here lies Netflix." });
    const entering = tombstoneMotionCalls.filter((call) => call.reduced);
    expect(entering.length).toBeGreaterThan(0);
    expect(tombstoneMotionCalls.every((call) => call.reduced)).toBe(true);
    for (const call of entering) {
      for (const key of ["initial", "animate"]) {
        expect(Object.keys(call.result[key] as object)).toEqual(["opacity"]);
      }
    }
  });
});

describe("graveyard memory flow: re-attach", () => {
  const APPLE_STATEMENT = [
    "Date,Description,Amount",
    "01/05/2026,APPLE.COM/BILL 866-712-7753 CA,-10.99",
    "02/05/2026,APPLE.COM/BILL 866-712-7753 CA,-10.99",
    "03/05/2026,APPLE.COM/BILL 866-712-7753 CA,-10.99",
    "04/05/2026,APPLE.COM/BILL 866-712-7753 CA,-11.99",
    "02/09/2026,SPOTIFY USA NEW YORK NY,-10.99",
    "03/09/2026,SPOTIFY USA NEW YORK NY,-10.99",
    "04/09/2026,SPOTIFY USA NEW YORK NY,-10.99",
  ].join("\n");

  it("carries a buried Apple Music record onto its price-changed subscription", async () => {
    mount({ text: storeText(APPLE) });
    const file = new File([APPLE_STATEMENT], "statement.csv", { type: "text/csv" });
    fireEvent.drop(
      screen.getByRole("button", { name: "Drop area: choose or drop a CSV statement" }),
      { dataTransfer: { files: [file], types: ["Files"] } },
    );
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });

    // The record answers for the Apple subscription, so only Spotify rises.
    cardHeading("Spotify");
    expect(screen.queryByRole("heading", { level: 3, name: /Apple/ })).toBeNull();
    const line = carriedOverLine(1);
    expect(line).toBe("1 earlier answer was carried over to this statement.");
    expect(screen.getAllByText(line)).toHaveLength(1);
    expect(liveRegion().textContent).toContain(line);

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect(screen.getByText(CARRIED_OVER_NOTE)).toBeTruthy();
    expect(CARRIED_OVER_NOTE).toBe("Answer carried over from an earlier statement");
    expect(screen.queryByText(EARLIER_NOTE)).toBeNull();
  });
});
