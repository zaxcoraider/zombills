import { describe, expect, it } from "vitest";
import { initialPageModel, pageReducer } from "../page-state";
import { STORE_KEY } from "../storage/graveyard-store";
import { fakeStorage } from "../storage/test-store";
import { encodeGraveyard } from "./graveyard-codec";
import type { AnswerRecord, Graveyard } from "./graveyard";
import {
  lastWrittenAfter,
  storageCommands,
  type MemorySnapshot,
  type StorageCommand,
} from "./storage-commands";

const NETFLIX: AnswerRecord = {
  id: "sub:USD:monthly:*:netflix",
  merchant: "Netflix",
  serviceId: "netflix",
  currency: "USD",
  cadence: "monthly",
  currentAmountCents: 1799,
  answer: "not-using",
  cadenceAssumed: false,
  carriedOver: false,
  yearlySavingCents: 21588,
};
const SPOTIFY: AnswerRecord = {
  id: "sub:USD:monthly:*:spotify",
  merchant: "Spotify",
  serviceId: "spotify",
  currency: "USD",
  cadence: "monthly",
  currentAmountCents: 1099,
  answer: "still-using",
  cadenceAssumed: false,
  carriedOver: false,
  yearlySavingCents: 13188,
};
// Same text as NETFLIX once encoded: yearlySavingCents is derived, not stored.
const NETFLIX_COPY: AnswerRecord = { ...NETFLIX };

function snap(overrides: Partial<MemorySnapshot> = {}): MemorySnapshot {
  return { on: false, graveyard: [], removal: null, lastWritten: null, ...overrides };
}

const ONE: Graveyard = [NETFLIX];
const ONE_TEXT = encodeGraveyard(ONE).text;

describe("storageCommands", () => {
  it("issues nothing on the first run after an empty load", () => {
    expect(storageCommands(null, snap())).toEqual([]);
  });

  it("issues nothing after an ok load whose encoding equals the raw text", () => {
    expect(
      storageCommands(null, snap({ on: true, graveyard: ONE, lastWritten: ONE_TEXT })),
    ).toEqual([]);
  });

  it("rewrites with reason load when the raw text differs (extra fields or dropped > 0)", () => {
    const raw = ONE_TEXT.replace("{", '{"extra":1,');
    const commands = storageCommands(null, snap({ on: true, graveyard: ONE, lastWritten: raw }));
    expect(commands).toEqual([{ kind: "write", text: ONE_TEXT, leftOut: 0, reason: "load" }]);
  });

  it("removes an unreadable Store on the first run", () => {
    const next = snap({ removal: { seq: 1, reason: "unreadable" } });
    expect(storageCommands(null, next)).toEqual([{ kind: "remove", reason: "unreadable" }]);
  });

  it("writes with reason turn-on on a tick, also when lastWritten holds the same text", () => {
    const prev = snap({ on: false, graveyard: ONE, lastWritten: ONE_TEXT });
    const next = snap({ on: true, graveyard: ONE, lastWritten: ONE_TEXT });
    expect(storageCommands(prev, next)).toEqual([
      { kind: "write", text: ONE_TEXT, leftOut: 0, reason: "turn-on" },
    ]);
  });

  it("removes on an untick and does not write", () => {
    const prev = snap({ on: true, graveyard: ONE, lastWritten: ONE_TEXT });
    const next = snap({ on: false, graveyard: ONE, removal: { seq: 1, reason: "untick" } });
    expect(storageCommands(prev, next)).toEqual([{ kind: "remove", reason: "untick" }]);
  });

  it("issues nothing for the same snapshot twice, also after a failed write", () => {
    const state = snap({ on: true, graveyard: ONE, lastWritten: ONE_TEXT });
    expect(storageCommands(state, state)).toEqual([]);
    const failed = snap({ on: true, graveyard: ONE, lastWritten: null });
    expect(storageCommands(failed, { ...failed })).toEqual([]);
  });

  it("issues nothing for a Graveyard change that encodes to the same text", () => {
    const prev = snap({ on: true, graveyard: ONE, lastWritten: ONE_TEXT });
    const next = snap({ on: true, graveyard: [NETFLIX_COPY], lastWritten: ONE_TEXT });
    expect(next.graveyard).not.toBe(prev.graveyard);
    expect(storageCommands(prev, next)).toEqual([]);
  });

  it("writes with reason change when the encoding differs", () => {
    const prev = snap({ on: true, graveyard: ONE, lastWritten: ONE_TEXT });
    const two: Graveyard = [NETFLIX, SPOTIFY];
    const next = snap({ on: true, graveyard: two, lastWritten: ONE_TEXT });
    expect(storageCommands(prev, next)).toEqual([
      { kind: "write", text: encodeGraveyard(two).text, leftOut: 0, reason: "change" },
    ]);
  });

  it("issues nothing while Memory is off, whatever changes", () => {
    const prev = snap({ on: false, graveyard: ONE });
    const next = snap({ on: false, graveyard: [NETFLIX, SPOTIFY] });
    expect(storageCommands(prev, next)).toEqual([]);
  });

  it("does not repeat a removal with the same seq", () => {
    const removal = { seq: 2, reason: "forget" as const };
    const prev = snap({ removal });
    const next = snap({ removal, graveyard: ONE });
    expect(storageCommands(prev, next)).toEqual([]);
  });

  it("returns only write and remove commands", () => {
    const cases: [MemorySnapshot | null, MemorySnapshot][] = [
      [null, snap()],
      [null, snap({ on: true, graveyard: ONE })],
      [snap(), snap({ on: true, graveyard: ONE })],
      [snap({ on: true }), snap({ removal: { seq: 1, reason: "forget" } })],
      [snap({ on: true }), snap({ on: true, graveyard: [NETFLIX, SPOTIFY] })],
    ];
    for (const [prev, next] of cases) {
      for (const command of storageCommands(prev, next)) {
        expect(["write", "remove"]).toContain(command.kind);
      }
    }
  });
});

describe("lastWrittenAfter", () => {
  const write: StorageCommand = { kind: "write", text: "T", leftOut: 0, reason: "change" };
  const remove: StorageCommand = { kind: "remove", reason: "untick" };

  it("gives the text of a successful write", () => {
    expect(lastWrittenAfter("old", write, true)).toBe("T");
  });

  it("gives null after a failed write", () => {
    expect(lastWrittenAfter("old", write, false)).toBeNull();
  });

  it("gives null after a remove", () => {
    expect(lastWrittenAfter("old", remove, true)).toBeNull();
    expect(lastWrittenAfter("old", remove, false)).toBeNull();
  });
});

describe("storage failures (Req 3.8)", () => {
  it("a throwing setItem followed by store-write-failed gives Memory off and a write-failed note", () => {
    const storage = fakeStorage({ throwOn: { set: true } });
    const ticked = pageReducer(initialPageModel({ kind: "empty" }), {
      type: "set-memory",
      on: true,
    });
    const next = snap({ on: ticked.memory.on, graveyard: ONE, removal: ticked.memory.removal });
    const commands = storageCommands(snap(), next);
    expect(commands).toHaveLength(1);
    const [command] = commands;
    expect(command?.kind).toBe("write");
    if (command?.kind !== "write") return;
    expect(() => storage.setItem(STORE_KEY, command.text)).toThrow();
    expect(lastWrittenAfter(null, command, false)).toBeNull();
    const failed = pageReducer(ticked, { type: "store-write-failed" });
    expect(failed.memory.on).toBe(false);
    expect(failed.memory.storageNote).toBe("write-failed");
  });

  it("a throwing removeItem after untick followed by store-remove-failed gives Memory off and a remove-failed note", () => {
    const storage = fakeStorage({ throwOn: { remove: true }, initial: { [STORE_KEY]: ONE_TEXT } });
    const on = initialPageModel({ kind: "ok", graveyard: ONE, dropped: 0 });
    const unticked = pageReducer(on, { type: "set-memory", on: false });
    expect(unticked.memory.on).toBe(false);
    const commands = storageCommands(
      snap({ on: true, graveyard: ONE, lastWritten: ONE_TEXT }),
      snap({ on: false, graveyard: ONE, removal: unticked.memory.removal }),
    );
    expect(commands).toEqual([{ kind: "remove", reason: "untick" }]);
    expect(() => storage.removeItem(STORE_KEY)).toThrow();
    const failed = pageReducer(unticked, { type: "store-remove-failed", reason: "untick" });
    expect(failed.memory.on).toBe(false);
    expect(failed.memory.storageNote).toBe("remove-failed");
  });
});
