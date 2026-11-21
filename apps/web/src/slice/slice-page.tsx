import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Dispatch, ReactNode } from "react";
import { buttonVariant } from "./button-variants";
import { CompactHeader } from "./chrome/compact-header";
import { LeaveQuestion } from "./chrome/leave-question";
import { ErrorView } from "./error-view";
import { FadeIn } from "./fade-in";
import { nextFrame, nextTask } from "./frame";
import { GraveyardView } from "./graveyard/graveyard-view";
import { RidgeBand } from "./graveyard/graveyard-backdrop";
import { NightScene } from "./graveyard/night-scene";
import { RisingView } from "./graveyard/rising-view";
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
import {
  initialPageModel,
  isLandingView,
  isWideView,
  pageReducer,
  shouldAskBeforeLeaving,
} from "./page-state";
import type { PageAction, PageModel, StartFrom } from "./page-state";
import { SiteFooter } from "./site-footer";
import {
  StatementDisclosure,
  disclosureFocusStep,
  openOnWindowDrag,
} from "./statement/statement-disclosure";
import { StatementPanel } from "./statement/statement-panel";
import type { Sample } from "./samples";
import { useGraveyardMemory } from "./storage/use-graveyard-memory";
import type { GraveyardStore, StoreLoad } from "./storage/graveyard-store";

type StatementSource = { kind: "file"; file: File } | { kind: "sample"; sample: Sample };

function preventDefault(event: Event) {
  event.preventDefault();
}

const PANEL_CLASS = "rounded-card bg-fog/95 p-6";

interface MainStateProps {
  model: PageModel;
  haunt: HauntView;
  reduceMotion: boolean;
  dispatch: Dispatch<PageAction>;
  onStartAgain: () => void;
  /** Set when the Graveyard has records, for "Open the graveyard" in the state Card. */
  onOpenGraveyard: (() => void) | undefined;
  /** The Statement disclosure, placed inside the Rising grid on `results` (Req 7.3) */
  statementSlot: ReactNode;
}

/** The state content of `main` on the main screen: one view at a time. */
function MainState({
  model,
  haunt,
  reduceMotion,
  dispatch,
  onStartAgain,
  onOpenGraveyard,
  statementSlot,
}: MainStateProps) {
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
            statementSlot={statementSlot}
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
              onOpenGraveyard={onOpenGraveyard}
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
              onOpenGraveyard={onOpenGraveyard}
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
  const homeRef = useRef<HTMLButtonElement>(null);
  // The Leave question (Req 1.4 to 1.6); `seq` rises on every Home press while it is open.
  const [leave, setLeave] = useState<{ open: boolean; seq: number }>({ open: false, seq: 0 });
  const handledSeq = useRef(0);
  const claim = useCallback((seq: number) => {
    if (seq <= handledSeq.current) return false;
    handledSeq.current = seq;
    return true;
  }, []);
  const focusValue = useMemo(() => ({ focus: model.focus, claim }), [model.focus, claim]);

  // The Statement disclosure (Req 3.7, 3.8): collapsed on first show of each view, so its state
  // is reset during render whenever the view key changes. A card answer keeps the key.
  const viewKey = `${view.kind}:${model.screen}`;
  const [statement, setStatement] = useState({ key: viewKey, open: false });
  if (statement.key !== viewKey) setStatement({ key: viewKey, open: false });
  const statementOpen = statement.key === viewKey && statement.open;
  // Shown on `results` (either screen) and the Graveyard view; `working`, `error` and
  // `no-subscriptions` are always on the main screen and show the panel open.
  const disclosureShown = view.kind === "results" || model.screen === "graveyard";
  const onToggleStatement = useCallback(() => {
    setStatement((s) => ({ key: viewKey, open: s.key === viewKey ? !s.open : true }));
  }, [viewKey]);

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

  // A file dragged over the window opens the collapsed disclosure, so its drop area can take
  // the drop (Req 3.8). It never moves focus.
  const working = view.kind === "working";
  const openOnDrag = openOnWindowDrag(["Files"], disclosureShown, statementOpen, working);
  useEffect(() => {
    if (!openOnDrag) return;
    const onDragEnter = (event: DragEvent) => {
      const types = event.dataTransfer?.types;
      const list = types === undefined ? undefined : Array.from(types);
      if (!openOnWindowDrag(list, disclosureShown, statementOpen, working)) return;
      setStatement({ key: viewKey, open: true });
    };
    window.addEventListener("dragenter", onDragEnter);
    return () => window.removeEventListener("dragenter", onDragEnter);
  }, [openOnDrag, viewKey, disclosureShown, statementOpen, working]);

  // Focus a request's target when it is already mounted; a target that mounts later claims the
  // request itself (`useFocusRequest`). Keys are compared as strings, never put in a selector.
  const focusSeq = model.focus?.seq;
  useEffect(() => {
    const request = model.focus;
    if (request === null || mainRef.current === null) return;
    if (disclosureFocusStep(request.target, disclosureShown, statementOpen) === "open") {
      // A hidden drop area cannot take focus: open first; the next run claims (Req 3.8).
      setStatement({ key: viewKey, open: true });
      return;
    }
    const key = focusKey(request);
    for (const el of mainRef.current.querySelectorAll<HTMLElement>("[data-focus]")) {
      if (el.dataset.focus === key) {
        if (claim(request.seq)) focusAndReveal(el);
        return;
      }
    }
  }, [focusSeq, statementOpen]);

  async function runAnalysis(source: StatementSource, from?: StartFrom): Promise<void> {
    nextRunId.current += 1;
    const runId = nextRunId.current;
    const sourceName = source.kind === "file" ? source.file.name : source.sample.label;
    dispatch({ type: "start", runId, sourceName, ...(from === undefined ? {} : { from }) });

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

  function onFiles(files: File[], from?: StartFrom) {
    const check = checkFiles(files);
    if (check.ok) {
      void runAnalysis({ kind: "file", file: check.file }, from);
    } else if (check.error !== null) {
      const sourceName = files.length === 1 ? (files[0]?.name ?? null) : null;
      dispatch({ type: "reject", sourceName, error: check.error });
    }
  }

  function onChooseSample(sample: Sample, from?: StartFrom) {
    void runAnalysis({ kind: "sample", sample }, from);
  }

  // The gate's controls name themselves, so focus follows into the working panel; the Landing
  // view's controls never set `from`. The gate always hands focus over, whether the control was
  // clicked (Safari does not focus a clicked button), dropped on, or focus sat elsewhere (a
  // Rising control that unmounts on `working`). The one exception is focus inside the open
  // Leave question, which follows the Leave question's own rule (Decision "Focus while another
  // statement is read", review B #3).
  function focusInLeaveQuestion(): boolean {
    if (!leave.open) return false;
    const question = mainRef.current?.firstElementChild ?? null;
    return question !== null && question.contains(document.activeElement);
  }

  function onGateFiles(files: File[]) {
    onFiles(files, focusInLeaveQuestion() ? undefined : { target: "drop-zone" });
  }

  function onGateSample(sample: Sample) {
    const from: StartFrom = { target: "sample-chip", id: sample.fileName };
    onChooseSample(sample, focusInLeaveQuestion() ? undefined : from);
  }

  function onStartAgain() {
    dispatch({ type: "reset" });
  }

  const homeDisabled = view.kind === "working";
  function onHome() {
    if (homeDisabled) return;
    if (shouldAskBeforeLeaving(model)) setLeave((l) => ({ open: true, seq: l.seq + 1 }));
    else dispatch({ type: "go-home" });
  }

  function onStay() {
    setLeave((l) => ({ ...l, open: false }));
    homeRef.current?.focus();
  }

  // A change of state kind or screen closes the Leave question, not a step within one kind
  // (Req 1.4). Focus inside it moves to the Home control; the go-home focus request lands later.
  useEffect(() => {
    if (!leave.open) return;
    // While open, the Leave question is `main`'s first child (it renders before the order-1 slot).
    const question = mainRef.current?.firstElementChild ?? null;
    const active = document.activeElement;
    if (question !== null && active !== null && question.contains(active)) {
      homeRef.current?.focus();
    }
    setLeave((l) => ({ ...l, open: false }));
    // `leave.open` is left out of the dependencies on purpose: opening the question must not
    // run this effect, or it would close the question at once.
  }, [view.kind, model.screen]);

  const landing = isLandingView(model);
  const wide = isWideView(model);
  const onReadNote = useCallback(() => {
    if (privacyNoteRef.current !== null) focusAndReveal(privacyNoteRef.current);
  }, []);

  const onGraveyard = model.screen === "graveyard";
  const hasStatement = view.kind === "results";
  const enteringId = model.event?.kind === "buried" && onGraveyard ? model.event.id : null;
  const showOpenGraveyard =
    !onGraveyard &&
    model.graveyard.length > 0 &&
    (view.kind === "idle" || view.kind === "error" || view.kind === "no-subscriptions");
  const onOpenGraveyard = useCallback(() => dispatch({ type: "open-graveyard" }), []);
  // "Start again" shows wherever a statement or a state other than `idle` can be put away: on
  // `results`, and on the Graveyard view opened from `error` or `no-subscriptions` (Req 1.9, 3.7).
  const showStartAgain = hasStatement || (onGraveyard && view.kind !== "idle" && !working);
  // On `results` on the main screen the gate sits inside the Rising grid (Req 7.3); everywhere
  // else it follows the state content in `main`.
  const gateInRising = hasStatement && !onGraveyard;

  const gate = disclosureShown ? (
    <StatementDisclosure open={statementOpen} onToggle={onToggleStatement}>
      <StatementPanel
        place="gate"
        showHeading={false}
        disabled={working}
        reduceMotion={reduceMotion}
        onFiles={onGateFiles}
        onChooseSample={onGateSample}
      />
      {showStartAgain ? (
        <div>
          <button
            type="button"
            {...buttonVariant("tertiary", { bare: true })}
            onClick={onStartAgain}
          >
            Start again
          </button>
        </div>
      ) : null}
    </StatementDisclosure>
  ) : (
    <StatementPanel
      place="gate"
      showHeading
      disabled={working}
      reduceMotion={reduceMotion}
      onFiles={onGateFiles}
      onChooseSample={onGateSample}
    />
  );

  return (
    <FocusRequestContext.Provider value={focusValue}>
      <AnnounceContext.Provider value={announceValue}>
        <NightScene
          fogCleared={haunt.fogCleared}
          reduceMotion={reduceMotion}
          landing={landing}
          skyMoon={!landing && !wide}
        >
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
                <OwnStatement disabled={working} reduceMotion={reduceMotion} onFiles={onFiles} />
              </main>
              <SiteFooter
                noteRef={privacyNoteRef}
                wide
                landing
                reduceMotion={reduceMotion}
                onReadNote={onReadNote}
              />
            </>
          ) : (
            <>
              <CompactHeader
                haunt={haunt}
                reduceMotion={reduceMotion}
                wide={wide}
                homeDisabled={homeDisabled}
                homeRef={homeRef}
                onHome={onHome}
              />
              <main
                ref={mainRef}
                className={`mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-6${wide ? " w-full lg:max-w-[1184px] lg:px-8" : ""}`}
              >
                {leave.open ? (
                  <LeaveQuestion
                    seq={leave.seq}
                    onStay={onStay}
                    onLeave={() => dispatch({ type: "go-home" })}
                  />
                ) : null}
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
                      onOpenGraveyard={showOpenGraveyard ? onOpenGraveyard : undefined}
                      statementSlot={gateInRising ? gate : null}
                    />
                  )}
                </div>
                {gateInRising ? null : (
                  <div key="gate" className="order-2 flex flex-col gap-4">
                    {gate}
                  </div>
                )}
              </main>
              <div className="w-full">
                <RidgeBand />
              </div>
              <SiteFooter
                noteRef={privacyNoteRef}
                wide={wide}
                reduceMotion={reduceMotion}
                onReadNote={onReadNote}
              />
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
