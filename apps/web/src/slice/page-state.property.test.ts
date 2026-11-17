import { classifySubscriptions } from "@zombills/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AnalysisOutcome } from "./logic/analyze-statement";
import type { PageError } from "./logic/messages";
import { GUESSED_AMAZON_PRIME, POSSESSED_TRIAL_TRAP, TRIAL_TRAP } from "./graveyard/test-fixtures";
import { answerRecordFor, answersMap, savingsTotals } from "./logic/graveyard";
import type { AnswerRecord, Graveyard } from "./logic/graveyard";
import { decodeStore } from "./logic/graveyard-codec";
import { queueOf, risingOrder } from "./logic/queue";
import { lastWrittenAfter, storageCommands } from "./logic/storage-commands";
import type { MemorySnapshot, StorageCommand } from "./logic/storage-commands";
import {
  answerableListArb,
  deepFreeze,
  pageGraveyardArb,
  resultsOutcomeOf,
} from "./logic/test-arbitraries";
import { INITIAL_PAGE_MODEL, initialPageModel, pageReducer } from "./page-state";
import { STORE_KEY } from "./storage/graveyard-store";
import { fakeStorage } from "./storage/test-store";
import type { BurialPhase, PageAction, PageModel } from "./page-state";

const FACTS = {
  transactionCount: 3,
  rowErrorCount: 0,
  statement: {
    firstDate: "2026-01-02",
    lastDate: "2026-03-25",
    asOf: "2026-03-25",
    asOfSource: "statement" as const,
    currencies: ["USD"],
  },
  detectedCurrency: { code: "USD", source: "symbol" as const },
  detectedDateFormat: null,
  detectedSignConvention: null,
};

const outcomeArb: fc.Arbitrary<AnalysisOutcome> = fc.constantFrom<AnalysisOutcome>(
  { kind: "empty" },
  { kind: "parse-error", reason: "bad" },
  {
    kind: "columns-unreadable",
    columns: ["A"],
    found: { date: false, description: false, amount: false },
  },
  { kind: "no-transactions", rowErrorCount: 2 },
  { kind: "no-subscriptions", ...FACTS },
  { kind: "results", ...FACTS, subscriptions: [], totals: [] },
  {
    kind: "results",
    ...FACTS,
    subscriptions: [TRIAL_TRAP, POSSESSED_TRIAL_TRAP, GUESSED_AMAZON_PRIME],
    totals: [{ currency: "USD", totalCents: 1000 }],
  },
);

const idArb = fc.constantFrom(
  TRIAL_TRAP.id,
  POSSESSED_TRIAL_TRAP.id,
  GUESSED_AMAZON_PRIME.id,
  "missing",
);
const phaseArb = fc.constantFrom<BurialPhase>("condemned", "sinking", "closing");

const errorArb: fc.Arbitrary<PageError> = fc.constantFrom<PageError>(
  { kind: "too-many-files" },
  { kind: "too-large" },
  { kind: "not-csv" },
  { kind: "unreadable-file" },
);

const runIdArb = fc.integer({ min: 0, max: 4 });

const actionArb: fc.Arbitrary<PageAction> = fc.oneof(
  fc.record({
    type: fc.constant("start" as const),
    runId: runIdArb,
    sourceName: fc.constantFrom("a.csv", "b.csv"),
  }),
  fc.record({ type: fc.constant("finish" as const), runId: runIdArb, outcome: outcomeArb }),
  fc.record({ type: fc.constant("fail" as const), runId: runIdArb, error: errorArb }),
  fc.record({
    type: fc.constant("reject" as const),
    sourceName: fc.constantFrom("a.csv", null),
    error: errorArb,
  }),
  fc.constant({ type: "reset" as const }),
  fc.record({ type: fc.constant("keep" as const), id: idArb }),
  fc.record({ type: fc.constant("bury" as const), id: idArb, reducedMotion: fc.boolean() }),
  fc.record({ type: fc.constant("burial-step" as const), id: idArb, from: phaseArb }),
  fc.record({ type: fc.constant("burial-finish" as const), id: idArb }),
  fc.record({ type: fc.constant("skip" as const), id: idArb }),
  fc.constant({ type: "next" as const }),
  fc.constant({ type: "open-graveyard" as const }),
  fc.constant({ type: "back-to-rising" as const }),
  fc.constant({ type: "back-to-start" as const }),
  fc.record({ type: fc.constant("answer-now" as const), id: idArb }),
  fc.record({ type: fc.constant("unbury" as const), id: idArb }),
  fc.record({ type: fc.constant("bury-after-all" as const), id: idArb }),
);

const GRAVEYARD_KEEPING: readonly PageAction["type"][] = [
  "start",
  "fail",
  "reject",
  "reset",
  "open-graveyard",
  "back-to-rising",
  "back-to-start",
];

/**
 * An independent statement of each id-guard in the design's transition table: true when the
 * action must be accepted, false when it must return the same model object, null for other actions.
 */
function guardHolds(model: PageModel, action: PageAction): boolean | null {
  const { view } = model;
  const results = view.kind === "results" ? view : null;
  const queue = results === null ? [] : queueOf(results.rising.order, model.graveyard);
  const stage = results?.rising.stage;
  const inAsk = results !== null && model.screen === "main" && stage?.kind === "ask";
  const answerOf = (id: string) => model.graveyard.find((record) => record.id === id)?.answer;
  switch (action.type) {
    case "keep":
    case "bury":
      return inAsk && queue[0] === action.id;
    case "skip":
      return inAsk && queue[0] === action.id && queue.length > 1;
    case "burial-step":
      return stage?.kind === "burying" && stage.id === action.id && stage.phase === action.from;
    case "burial-finish":
      return stage?.kind === "burying" && stage.id === action.id;
    case "answer-now":
      return results !== null && model.screen === "graveyard" && queue.includes(action.id);
    case "unbury":
      return model.screen === "graveyard" && answerOf(action.id) === "not-using";
    case "bury-after-all":
      return model.screen === "graveyard" && answerOf(action.id) === "still-using";
    default:
      return null;
  }
}

const VIEW_KINDS = ["idle", "working", "results", "no-subscriptions", "error"];

describe("page reducer properties", () => {
  it("P7: one view at a time; ignored actions change nothing; reset gives idle", () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 40 }), (actions) => {
        let model = INITIAL_PAGE_MODEL;
        for (const action of actions) {
          const before = model;
          model = pageReducer(before, action);

          expect(VIEW_KINDS).toContain(model.view.kind);
          expect("rising" in model.view).toBe(model.view.kind === "results");
          if (GRAVEYARD_KEEPING.includes(action.type)) {
            expect(model.graveyard).toBe(before.graveyard);
          }
          if (action.type !== "finish") expect(model.memory).toBe(before.memory);
          const guard = guardHolds(before, action);
          if (guard === false) expect(model).toBe(before);
          if (guard === true) expect(model).not.toBe(before);
          expect(Object.keys(model).sort()).toEqual([
            "event",
            "focus",
            "graveyard",
            "memory",
            "runId",
            "screen",
            "view",
          ]);

          const working = before.view.kind === "working";
          if ((action.type === "start" || action.type === "reject") && working) {
            expect(model).toBe(before);
          }
          if (action.type === "finish" || action.type === "fail") {
            const applies = working && action.runId === before.runId;
            if (applies) expect(model.view.kind).not.toBe("working");
            else expect(model).toBe(before);
          }
          if (
            action.type === "reset" &&
            ["results", "no-subscriptions", "error"].includes(before.view.kind)
          ) {
            expect(model.view).toEqual({ kind: "idle" });
          }
        }
      }),
    );
  });
});

const totalIn = (graveyard: Graveyard, currency: string): number =>
  savingsTotals(graveyard).find((total) => total.currency === currency)?.totalCents ?? 0;

/** A model on the Graveyard screen showing `outcomeList` as a results view, with `graveyard` restored. */
function graveyardScreenOf(
  graveyard: Graveyard,
  subscriptions: Parameters<typeof resultsOutcomeOf>[0],
): PageModel {
  let model = initialPageModel({ kind: "ok", graveyard, dropped: 0 });
  model = pageReducer(model, { type: "start", runId: 1, sourceName: "a.csv" });
  model = pageReducer(model, {
    type: "finish",
    runId: 1,
    outcome: resultsOutcomeOf(subscriptions),
  });
  return pageReducer(model, { type: "open-graveyard" });
}

describe("memory page state properties", () => {
  it("P5: Earlier changes restore the record and move the totals by its saving", () => {
    fc.assert(
      fc.property(pageGraveyardArb, answerableListArb(6), (records, list) => {
        const subscriptions = deepFreeze(list);
        // Some Current records too, so "every other record unchanged" has something to check.
        const current = subscriptions.slice(0, 2).map((s) => answerRecordFor(s, "not-using"));
        const graveyard = deepFreeze([...records, ...current]);
        const start = graveyardScreenOf(graveyard, subscriptions);
        expect(start.screen).toBe("graveyard");
        const currentIds = new Set(subscriptions.map((s) => s.id));

        for (const original of graveyard.filter((record) => !currentIds.has(record.id))) {
          const opposite = original.answer === "not-using" ? "unbury" : "bury-after-all";
          const back = original.answer === "not-using" ? "bury-after-all" : "unbury";
          const first = pageReducer(start, { type: opposite, id: original.id });
          const second = pageReducer(first, { type: back, id: original.id });
          const find = (model: PageModel): AnswerRecord | undefined =>
            model.graveyard.find((record) => record.id === original.id);

          // unbury then bury-after-all (or the reverse) gives the original, carriedOver false
          expect(find(second)).toEqual({ ...original, carriedOver: false });

          const changed = find(first);
          expect(changed).toBeDefined();
          if (changed === undefined) continue;
          const saving = (original.answer === "not-using" ? original : changed).yearlySavingCents;
          if (original.answer === "still-using" && original.cadenceAssumed) {
            expect(changed.yearlySavingCents).toBeNull();
          }
          const sign = original.answer === "not-using" ? -1 : 1;
          expect(totalIn(first.graveyard, original.currency)).toBe(
            totalIn(start.graveyard, original.currency) + sign * (saving ?? 0),
          );
          expect(totalIn(second.graveyard, original.currency)).toBe(
            totalIn(start.graveyard, original.currency),
          );

          // answersMap and every other record unchanged
          expect(answersMap(first.graveyard, subscriptions)).toEqual(
            answersMap(start.graveyard, subscriptions),
          );
          expect(first.graveyard.filter((record) => record.id !== original.id)).toEqual(
            start.graveyard.filter((record) => record.id !== original.id),
          );
          expect(first.graveyard.map((record) => record.id)).toEqual(
            start.graveyard.map((record) => record.id),
          );
        }
      }),
    );
  });

  it("P6: Forget empties the Graveyard, resets the Queue and removes the Store key", () => {
    const scenarioArb = fc.record({
      records: pageGraveyardArb,
      list: answerableListArb(6),
      outcome: fc.constantFrom("none", "no-subscriptions", "results"),
      memoryOn: fc.boolean(),
    });
    fc.assert(
      fc.property(scenarioArb, ({ records, list, outcome, memoryOn }) => {
        const subscriptions = deepFreeze(list);
        const current = subscriptions.map((s, i) =>
          answerRecordFor(s, i % 2 === 0 ? "not-using" : "still-using"),
        );
        const graveyard = deepFreeze([...records, ...current]);
        let model = initialPageModel({ kind: "ok", graveyard, dropped: 0 });
        if (!memoryOn) model = pageReducer(model, { type: "set-memory", on: false });
        if (outcome !== "none") {
          model = pageReducer(model, { type: "start", runId: 1, sourceName: "a.csv" });
          model = pageReducer(model, {
            type: "finish",
            runId: 1,
            outcome:
              outcome === "results"
                ? resultsOutcomeOf(subscriptions)
                : { ...resultsOutcomeOf([]), kind: "no-subscriptions" as const },
          });
        }
        model = pageReducer(model, { type: "open-graveyard" });
        const before = model;
        const forgotten = pageReducer(before, { type: "forget" });

        expect(forgotten.graveyard).toEqual([]);
        expect(forgotten.memory.on).toBe(false);
        if (forgotten.view.kind === "results") {
          const { outcome: shown, rising } = forgotten.view;
          const order = risingOrder(shown.subscriptions, shown.statement);
          expect(rising.order).toEqual(order);
          expect(queueOf(rising.order, forgotten.graveyard)).toEqual(order);
          expect(rising.stage).toEqual({ kind: "ask" });
          const answers = answersMap(forgotten.graveyard, shown.subscriptions);
          expect(answers.size).toBe(0);
          for (const subscription of classifySubscriptions(shown.subscriptions, answers)) {
            expect(subscription.labels).not.toContain("zombie");
          }
        }

        // The step's Commands, run on a non-throwing Storage, leave no Store key.
        const snapshot = (m: PageModel, lastWritten: string | null): MemorySnapshot => ({
          on: m.memory.on,
          graveyard: m.graveyard,
          removal: m.memory.removal,
          lastWritten,
        });
        const storage = fakeStorage({
          initial: memoryOn ? { [STORE_KEY]: "kept" } : {},
        });
        const commands: StorageCommand[] = storageCommands(
          snapshot(before, memoryOn ? "kept" : null),
          snapshot(forgotten, memoryOn ? "kept" : null),
        );
        for (const command of commands) {
          if (command.kind === "remove") storage.removeItem(STORE_KEY);
          else storage.setItem(STORE_KEY, command.text);
          void lastWrittenAfter(null, command, true);
        }
        expect(storage.peek(STORE_KEY)).toBeNull();
        expect(decodeStore(storage.getItem(STORE_KEY)).kind).toBe("empty");

        // A removeItem that throws: Memory stays off, and the failure sets the note.
        const throwing = fakeStorage({ throwOn: { remove: true } });
        expect(() => throwing.removeItem(STORE_KEY)).toThrow();
        expect(forgotten.memory.on).toBe(false);
        const failed = pageReducer(forgotten, { type: "store-remove-failed", reason: "forget" });
        expect(failed.memory.on).toBe(false);
        expect(failed.memory.storageNote).toBe("remove-failed");
      }),
    );
  });
});
