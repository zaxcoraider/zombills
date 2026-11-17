import type { UsageAnswer } from "@zombills/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { initialPageModel, pageReducer, type PageAction, type PageModel } from "../page-state";
import { STORE_KEY } from "../storage/graveyard-store";
import { fakeStorage, type FakeStorage } from "../storage/test-store";
import { answerRecordFor, type Graveyard } from "./graveyard";
import { decodeStore, encodeGraveyard, type ReadResult } from "./graveyard-codec";
import {
  lastWrittenAfter,
  storageCommands,
  type MemorySnapshot,
  type StorageCommand,
} from "./storage-commands";
import { deepFreeze, memoryActionArb, pageGraveyardArb, pageOutcomeArb } from "./test-arbitraries";

const answerArb = fc.constantFrom<UsageAnswer>("still-using", "not-using");

const scenarioArb = fc.tuple(pageOutcomeArb, pageGraveyardArb).chain(([pool, extra]) =>
  fc.record({
    start: fc.constantFrom("empty", "unreadable", "ok"),
    extra: fc.constant(extra),
    shared: fc.tuple(fc.subarray(pool), fc.array(answerArb, { maxLength: 12 })),
    actions: fc.array(
      memoryActionArb(
        extra.map((record) => record.id),
        pool,
      ),
      { maxLength: 30, size: "max" },
    ),
  }),
);

/** The records `encodeGraveyard` keeps, one by one, in the model's order. */
function keptByEncode(graveyard: Graveyard): Graveyard {
  return graveyard.filter((record) => encodeGraveyard([record]).leftOut === 0);
}

describe("storage commands properties", () => {
  it("P4: the write protocol keeps the Store equal to the Graveyard only while Memory is on", () => {
    let nonEmptyWrites = 0;
    fc.assert(
      fc.property(scenarioArb, ({ start, extra, shared, actions }) => {
        const [sharedSubs, answers] = shared;
        const sharedRecords = sharedSubs.flatMap((subscription, index) => {
          const answer = answers[index];
          return answer === undefined ? [] : [answerRecordFor(subscription, answer)];
        });
        const seen = new Set(sharedRecords.map((record) => record.id));
        const startGraveyard: Graveyard = deepFreeze([
          ...sharedRecords,
          ...extra.filter((record) => !seen.has(record.id)),
        ]);
        const rawText = encodeGraveyard(startGraveyard).text;
        const read: ReadResult =
          start === "ok" ? { kind: "ok", graveyard: startGraveyard, dropped: 0 } : { kind: start };
        const initial: Record<string, string> =
          start === "ok"
            ? { [STORE_KEY]: rawText }
            : start === "unreadable"
              ? { [STORE_KEY]: "{" }
              : {};
        const fake: FakeStorage = fakeStorage({ initial });

        let model: PageModel = initialPageModel(read);
        let lastWritten: string | null = start === "ok" ? rawText : null;
        let prev: MemorySnapshot | null = null;

        /** One step's effect cycle, as the hook runs it; returns the Commands it ran. */
        const settle = (): StorageCommand[] => {
          const ran: StorageCommand[] = [];
          for (let guard = 0; guard < 5; guard += 1) {
            const next: MemorySnapshot = {
              on: model.memory.on,
              graveyard: model.graveyard,
              removal: model.memory.removal,
              lastWritten,
            };
            const depsSame =
              prev !== null &&
              prev.on === next.on &&
              prev.removal === next.removal &&
              prev.graveyard === next.graveyard;
            if (depsSame) break;
            const commands = storageCommands(prev, next);
            prev = next;
            for (const command of commands) {
              ran.push(command);
              if (command.kind === "write") {
                fake.setItem(STORE_KEY, command.text);
                lastWritten = lastWrittenAfter(lastWritten, command, true);
                model = pageReducer(model, {
                  type: "store-written",
                  leftOut: command.leftOut,
                  reason: command.reason,
                });
              } else {
                fake.removeItem(STORE_KEY);
                lastWritten = lastWrittenAfter(lastWritten, command, true);
              }
            }
          }
          return ran;
        };

        const check = (ran: readonly StorageCommand[]): void => {
          const writes = ran.filter((command) => command.kind === "write");
          if (!model.memory.on) expect(writes).toEqual([]);
          for (const command of ran) {
            if (command.kind === "remove") {
              expect(["untick", "unreadable", "forget"]).toContain(command.reason);
            }
          }
          expect(writes.length).toBeLessThanOrEqual(1);
          if (model.memory.on) {
            const stored = decodeStore(fake.getItem(STORE_KEY));
            expect(stored.kind).toBe("ok");
            if (stored.kind === "ok") {
              expect(stored.graveyard).toEqual(keptByEncode(model.graveyard));
              expect(stored.dropped).toBe(0);
            }
          } else {
            expect(lastWritten).toBeNull();
          }
        };

        check(settle());
        for (const rawAction of actions) {
          const action: PageAction = deepFreeze(rawAction);
          const before = lastWritten;
          if (action.type === "store-removed-elsewhere") {
            // The key is gone in another tab; the hook's listener forgets the last text.
            fake.removeItem(STORE_KEY);
            lastWritten = null;
          }
          model = pageReducer(model, action);
          const ran = settle();
          for (const command of ran) {
            if (command.kind === "write" && before !== null) {
              expect(command.text).not.toBe(before);
            }
            if (command.kind === "write" && JSON.parse(command.text).records.length > 0) {
              nonEmptyWrites += 1;
            }
          }
          check(ran);
        }
      }),
    );
    expect(nonEmptyWrites).toBeGreaterThan(0);
  });
});
