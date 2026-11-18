import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Dispatch } from "react";
import { DropZone } from "./drop-zone";
import { ErrorView } from "./error-view";
import { FadeIn } from "./fade-in";
import { nextFrame, nextTask } from "./frame";
import { GraveyardView } from "./graveyard/graveyard-view";
import { RidgeBand } from "./graveyard/graveyard-backdrop";
import { NightScene } from "./graveyard/night-scene";
import { RisingView } from "./graveyard/rising-view";
import { SavingsCounter } from "./graveyard/savings-counter";
import { useBurialFallback } from "./graveyard/use-burial-fallback";
import { AnnounceContext } from "./graveyard/use-announce";
import { FocusRequestContext, focusAndReveal, focusKey } from "./graveyard/use-focus-request";
import { analyzeStatement } from "./logic/analyze-statement";
import { announcement } from "./logic/announce";
import { decodeStatementBytes } from "./logic/decode-bytes";
import { checkFiles, containsNul } from "./logic/file-checks";
import { deriveHaunt } from "./logic/haunt-view";
import type { HauntView } from "./logic/haunt-view";
import { HowItWorks } from "./landing/how-it-works";
import { Hero } from "./landing/hero";
import { LandingBanner } from "./landing/landing-banner";
import { OwnStatement } from "./landing/own-statement";
import { NoSubscriptionsView } from "./no-subscriptions-view";
import { restoredLine } from "./logic/memory-text";
import { initialPageModel, isLandingView, pageReducer } from "./page-state";
import type { PageAction, PageModel } from "./page-state";
import { SampleButtons } from "./sample-buttons";
import { SiteFooter } from "./site-footer";
import type { Sample } from "./samples";
import { useGraveyardMemory } from "./storage/use-graveyard-memory";
import type { GraveyardStore, StoreLoad } from "./storage/graveyard-store";

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
      // The Landing view renders this state (Req 1.1).
      return null;
    case "working":
      if (view.origin === "landing") return null;
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
            carriedOver={view.carriedOver}
            reduceMotion={reduceMotion}
            memoryOn={model.memory.on}
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

export interface SlicePageProps {
  store: GraveyardStore;
  initialStore: StoreLoad;
}

export function SlicePage({ store, initialStore }: SlicePageProps) {
  const [model, dispatch] = useReducer(pageReducer, initialStore.result, initialPageModel);
  useGraveyardMemory(model, store, initialStore.text, dispatch);
  const { view } = model;
  const reduceMotion = useReducedMotion() ?? false;
  const haunt = useMemo(() => deriveHaunt(model), [model.view, model.graveyard]);
  useBurialFallback(view.kind === "results" ? view.rising.stage : null, dispatch);
  const nextRunId = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const privacyNoteRef = useRef<HTMLParagraphElement>(null);
  const handledSeq = useRef(0);
  const claim = useCallback((seq: number) => {
    if (seq <= handledSeq.current) return false;
    handledSeq.current = seq;
    return true;
  }, []);
  const focusValue = useMemo(() => ({ focus: model.focus, claim }), [model.focus, claim]);

  // The live region shows a Copy notice until the haunt sentence changes (Req 8.3, 8.4).
  const [notice, setNotice] = useState<string | null>(null);
  const noticeSeq = useRef(0);
  const sentence = announcement(model);
  const lastSentence = useRef(sentence);
  const announce = useCallback((text: string) => {
    noticeSeq.current += 1;
    const mine = noticeSeq.current;
    setNotice("");
    void nextFrame().then(() => {
      if (noticeSeq.current === mine) setNotice(text);
    });
  }, []);
  const announceValue = useMemo(() => ({ announce }), [announce]);
  useEffect(() => {
    if (lastSentence.current === sentence) return;
    lastSentence.current = sentence;
    noticeSeq.current += 1;
    setNotice(null);
  }, [sentence]);

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

  const landing = isLandingView(model);
  const onReadNote = useCallback(() => {
    if (privacyNoteRef.current !== null) focusAndReveal(privacyNoteRef.current);
  }, []);

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
      <AnnounceContext.Provider value={announceValue}>
        <NightScene fogCleared={haunt.fogCleared} reduceMotion={reduceMotion} landing={landing}>
          {landing ? (
            <>
              <LandingBanner haunt={haunt} reduceMotion={reduceMotion} />
              <main
                ref={mainRef}
                className="mx-auto flex w-full max-w-[1184px] flex-col gap-12 px-4 pb-12 pt-6 sm:px-8 sm:pt-8 lg:pt-4"
              >
                <Hero
                  working={working}
                  workingSourceName={view.kind === "working" ? view.sourceName : null}
                  onChooseSample={onChooseSample}
                  onReadNote={onReadNote}
                  returnNotes={{
                    restored:
                      model.memory.restored && model.graveyard.length > 0
                        ? restoredLine(haunt.tombstones.length, haunt.kept.length)
                        : null,
                    loadNote: model.memory.loadNote,
                    showOpen: showOpenGraveyard,
                    onOpen: () => dispatch({ type: "open-graveyard" }),
                  }}
                />
                <div className="relative left-1/2 -mb-6 -mt-12 lg:-mb-8 lg:-mt-10 w-screen shrink-0 -translate-x-1/2">
                  <RidgeBand />
                </div>
                <HowItWorks />
                <OwnStatement disabled={working} onFiles={onFiles} />
              </main>
              <SiteFooter noteRef={privacyNoteRef} wide />
            </>
          ) : (
            <>
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
                      enteringSeq={enteringId !== null ? (model.focus?.seq ?? null) : null}
                      memory={model.memory}
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
                  {gateHeading ? (
                    <h2 className="text-xl font-bold">Read another statement</h2>
                  ) : null}
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
              <SiteFooter noteRef={privacyNoteRef} wide={false} />
            </>
          )}
          <p role="status" className="sr-only">
            {notice ?? sentence}
          </p>
        </NightScene>
      </AnnounceContext.Provider>
    </FocusRequestContext.Provider>
  );
}
