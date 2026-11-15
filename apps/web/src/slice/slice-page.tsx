import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { DropZone } from "./drop-zone";
import { ErrorView } from "./error-view";
import { FadeIn } from "./fade-in";
import { nextFrame, nextTask } from "./frame";
import { FocusRequestContext, focusKey } from "./graveyard/use-focus-request";
import { analyzeStatement } from "./logic/analyze-statement";
import { announcement } from "./logic/announce";
import { decodeStatementBytes } from "./logic/decode-bytes";
import { checkFiles, containsNul } from "./logic/file-checks";
import { NoSubscriptionsView } from "./no-subscriptions-view";
import { INITIAL_PAGE_MODEL, pageReducer } from "./page-state";
import { ResultsView } from "./results-view";
import { SampleButtons } from "./sample-buttons";
import type { Sample } from "./samples";

type StatementSource = { kind: "file"; file: File } | { kind: "sample"; sample: Sample };

function preventDefault(event: Event) {
  event.preventDefault();
}

export function SlicePage() {
  const [model, dispatch] = useReducer(pageReducer, INITIAL_PAGE_MODEL);
  const { view } = model;
  const nextRunId = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
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
        if (claim(request.seq)) el.focus({ preventScroll: false });
        return;
      }
    }
  }, [focusSeq]);

  // Until the results view is rebuilt, its heading is focused the slice's way (Req 8.4).
  useEffect(() => {
    if (view.kind === "results") headingRef.current?.focus();
  }, [view.kind]);

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

  return (
    <FocusRequestContext.Provider value={focusValue}>
      <main ref={mainRef} className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-8">
        <h1 className="font-display text-4xl">Zombills</h1>
        <p>
          Your statement stays on this device. A statement covering 2 to 3 months gives the best
          results.
        </p>
        <DropZone disabled={working} onFiles={onFiles} />
        <SampleButtons disabled={working} onChoose={onChooseSample} />
        {view.kind === "working" ? (
          <FadeIn key="working">
            <p>Reading {view.sourceName}…</p>
          </FadeIn>
        ) : null}
        {view.kind === "results" ? (
          <FadeIn key="results">
            <ResultsView
              sourceName={view.sourceName}
              outcome={view.outcome}
              headingRef={headingRef}
              onStartAgain={onStartAgain}
            />
          </FadeIn>
        ) : null}
        {view.kind === "no-subscriptions" ? (
          <FadeIn key="no-subscriptions">
            <NoSubscriptionsView
              sourceName={view.sourceName}
              outcome={view.outcome}
              onStartAgain={onStartAgain}
            />
          </FadeIn>
        ) : null}
        {view.kind === "error" ? (
          <FadeIn key="error">
            <ErrorView
              sourceName={view.sourceName}
              error={view.error}
              onStartAgain={onStartAgain}
            />
          </FadeIn>
        ) : null}
        <p role="status" className="sr-only">
          {announcement(model)}
        </p>
        <footer>
          <a href="#spike" className="underline">
            See the burial art spike
          </a>
        </footer>
      </main>
    </FocusRequestContext.Provider>
  );
}
