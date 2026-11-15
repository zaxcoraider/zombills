import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Dispatch } from "react";
import { DropZone } from "./drop-zone";
import { ErrorView } from "./error-view";
import { FadeIn } from "./fade-in";
import { nextFrame, nextTask } from "./frame";
import { GraveyardView } from "./graveyard/graveyard-view";
import { NightScene } from "./graveyard/night-scene";
import { RisingView } from "./graveyard/rising-view";
import { SavingsCounter } from "./graveyard/savings-counter";
import { useBurialFallback } from "./graveyard/use-burial-fallback";
import { FocusRequestContext, focusAndReveal, focusKey } from "./graveyard/use-focus-request";
import { analyzeStatement } from "./logic/analyze-statement";
import { announcement } from "./logic/announce";
import { decodeStatementBytes } from "./logic/decode-bytes";
import { checkFiles, containsNul } from "./logic/file-checks";
import { deriveHaunt } from "./logic/haunt-view";
import type { HauntView } from "./logic/haunt-view";
import { NoSubscriptionsView } from "./no-subscriptions-view";
import { INITIAL_PAGE_MODEL, pageReducer } from "./page-state";
import type { PageAction, PageModel } from "./page-state";
import { SampleButtons } from "./sample-buttons";
import type { Sample } from "./samples";

type StatementSource = { kind: "file"; file: File } | { kind: "sample"; sample: Sample };

function preventDefault(event: Event) {
  event.preventDefault();
}

const PANEL_CLASS = "rounded-2xl bg-fog/95 p-6";

interface MainStateProps {
  model: PageModel;
  haunt: HauntView;
  reduceMotion: boolean;
  dispatch: Dispatch<PageAction>;
  onStartAgain: () => void;
}

/** The state content of `main` on the main screen: one view at a time. */
function MainState({ model, haunt, reduceMotion, dispatch, onStartAgain }: MainStateProps) {
  const { view } = model;
  switch (view.kind) {
    case "idle":
      return (
        <div className={PANEL_CLASS}>
          <p>
            Your statement stays on this device. A statement covering 2 to 3 months gives the best
            results.
          </p>
        </div>
      );
    case "working":
      return (
        <FadeIn key="working">
          <div className={PANEL_CLASS}>
            <p>Reading {view.sourceName}…</p>
          </div>
        </FadeIn>
      );
    case "results":
      return (
        <FadeIn key="results">
          <RisingView
            sourceName={view.sourceName}
            outcome={view.outcome}
            rising={view.rising}
            haunt={haunt}
            reduceMotion={reduceMotion}
            dispatch={dispatch}
          />
        </FadeIn>
      );
    case "no-subscriptions":
      return (
        <FadeIn key="no-subscriptions">
          <div className={PANEL_CLASS}>
            <NoSubscriptionsView
              sourceName={view.sourceName}
              outcome={view.outcome}
              onStartAgain={onStartAgain}
            />
          </div>
        </FadeIn>
      );
    case "error":
      return (
        <FadeIn key="error">
          <div className={PANEL_CLASS}>
            <ErrorView
              sourceName={view.sourceName}
              error={view.error}
              onStartAgain={onStartAgain}
            />
          </div>
        </FadeIn>
      );
  }
}

export function SlicePage() {
  const [model, dispatch] = useReducer(pageReducer, INITIAL_PAGE_MODEL);
  const { view } = model;
  const reduceMotion = useReducedMotion() ?? false;
  const haunt = useMemo(() => deriveHaunt(model), [model.view, model.graveyard]);
  useBurialFallback(view.kind === "results" ? view.rising.stage : null, dispatch);
  const nextRunId = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const handledSeq = useRef(0);
  const claim = useCallback((seq: number) => {
    if (seq <= handledSeq.current) return false;
    handledSeq.current = seq;
    return true;
  }, []);
  const focusValue = useMemo(() => ({ focus: model.focus, claim }), [model.focus, claim]);

  // A file dropped outside the drop area is neither opened nor downloaded (Req 2.6).
  useEffect(() => {
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  // Focus a request's target when it is already mounted; a target that mounts later claims the
  // request itself (`useFocusRequest`). Keys are compared as strings, never put in a selector.
  const focusSeq = model.focus?.seq;
  useEffect(() => {
    const request = model.focus;
    if (request === null || mainRef.current === null) return;
    const key = focusKey(request);
    for (const el of mainRef.current.querySelectorAll<HTMLElement>("[data-focus]")) {
      if (el.dataset.focus === key) {
        if (claim(request.seq)) focusAndReveal(el);
        return;
      }
    }
  }, [focusSeq]);

  async function runAnalysis(source: StatementSource): Promise<void> {
    nextRunId.current += 1;
    const runId = nextRunId.current;
    const sourceName = source.kind === "file" ? source.file.name : source.sample.label;
    dispatch({ type: "start", runId, sourceName });

    let text: string;
    if (source.kind === "file") {
      try {
        const bytes = new Uint8Array(await source.file.arrayBuffer());
        text = decodeStatementBytes(bytes);
      } catch {
        dispatch({ type: "fail", runId, error: { kind: "unreadable-file" } });
        return;
      }
      if (containsNul(text)) {
        dispatch({ type: "fail", runId, error: { kind: "not-csv" } });
        return;
      }
    } else {
      text = source.sample.text;
    }

    await nextFrame();
    await nextTask();
    dispatch({ type: "finish", runId, outcome: analyzeStatement(text) });
  }

  function onFiles(files: File[]) {
    const check = checkFiles(files);
    if (check.ok) {
      void runAnalysis({ kind: "file", file: check.file });
    } else if (check.error !== null) {
      const sourceName = files.length === 1 ? (files[0]?.name ?? null) : null;
      dispatch({ type: "reject", sourceName, error: check.error });
    }
  }

  function onChooseSample(sample: Sample) {
    void runAnalysis({ kind: "sample", sample });
  }

  function onStartAgain() {
    dispatch({ type: "reset" });
  }

  const working = view.kind === "working";
  const onGraveyard = model.screen === "graveyard";
  const hasStatement = view.kind === "results";
  const enteringId = model.event?.kind === "buried" && onGraveyard ? model.event.id : null;
  const showOpenGraveyard =
    !onGraveyard &&
    model.graveyard.length > 0 &&
    (view.kind === "idle" || view.kind === "error" || view.kind === "no-subscriptions");
  const gateHeading = onGraveyard || hasStatement;
  const showStartAgain = hasStatement || (onGraveyard && view.kind !== "idle" && !working);

  return (
    <FocusRequestContext.Provider value={focusValue}>
      <NightScene fogCleared={haunt.fogCleared} reduceMotion={reduceMotion}>
        <div className="mx-auto max-w-[640px] px-4 pt-8">
          <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-fog/95 p-6">
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-4xl">Zombills</h1>
              <p>Your bank statement is haunted.</p>
            </div>
            <SavingsCounter
              totals={haunt.savings}
              fallbackCurrency={haunt.counterFallbackCurrency}
              reduceMotion={reduceMotion}
            />
          </header>
        </div>
        <main ref={mainRef} className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-6">
          <div className="order-1">
            {onGraveyard ? (
              <GraveyardView
                haunt={haunt}
                hasStatement={hasStatement}
                enteringId={enteringId}
                reduceMotion={reduceMotion}
                dispatch={dispatch}
              />
            ) : (
              <MainState
                model={model}
                haunt={haunt}
                reduceMotion={reduceMotion}
                dispatch={dispatch}
                onStartAgain={onStartAgain}
              />
            )}
          </div>
          <div key="gate" className="order-2 flex flex-col gap-4 rounded-2xl bg-fog/95 p-6">
            {gateHeading ? <h2 className="text-xl font-bold">Read another statement</h2> : null}
            <DropZone disabled={working} onFiles={onFiles} />
            <SampleButtons disabled={working} onChoose={onChooseSample} />
            {showOpenGraveyard ? (
              <div>
                <button
                  type="button"
                  className="rounded border border-bone bg-fog px-4 py-2 text-bone"
                  onClick={() => dispatch({ type: "open-graveyard" })}
                >
                  Open the graveyard
                </button>
              </div>
            ) : null}
          </div>
          <div className="order-3">
            {showStartAgain ? (
              <button
                type="button"
                className="rounded border border-bone bg-fog px-4 py-2 text-bone"
                onClick={onStartAgain}
              >
                Start again
              </button>
            ) : null}
          </div>
        </main>
        <p role="status" className="sr-only">
          {announcement(model)}
        </p>
      </NightScene>
    </FocusRequestContext.Provider>
  );
}
