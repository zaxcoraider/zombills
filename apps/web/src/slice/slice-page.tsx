import { useEffect, useReducer, useRef } from "react";
import { DropZone } from "./drop-zone";
import type { DropZoneHandle } from "./drop-zone";
import { ErrorView } from "./error-view";
import { FadeIn } from "./fade-in";
import { nextFrame, nextTask } from "./frame";
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
  const dropZoneRef = useRef<DropZoneHandle>(null);
  const focusDropZoneRef = useRef(false);

  // A file dropped outside the drop area is neither opened nor downloaded (Req 2.6).
  useEffect(() => {
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  // Move focus to the new state's heading, or to the drop area after Start again (Req 8.4, 4.10).
  useEffect(() => {
    if (view.kind === "results" || view.kind === "no-subscriptions" || view.kind === "error") {
      headingRef.current?.focus();
    } else if (view.kind === "idle" && focusDropZoneRef.current) {
      focusDropZoneRef.current = false;
      dropZoneRef.current?.focus();
    }
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
    focusDropZoneRef.current = true;
    dispatch({ type: "reset" });
  }

  const working = view.kind === "working";

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-4xl">Zombills</h1>
      <p>
        Your statement stays on this device. A statement covering 2 to 3 months gives the best
        results.
      </p>
      <DropZone ref={dropZoneRef} disabled={working} onFiles={onFiles} />
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
            headingRef={headingRef}
            onStartAgain={onStartAgain}
          />
        </FadeIn>
      ) : null}
      {view.kind === "error" ? (
        <FadeIn key="error">
          <ErrorView
            sourceName={view.sourceName}
            error={view.error}
            headingRef={headingRef}
            onStartAgain={onStartAgain}
          />
        </FadeIn>
      ) : null}
      <p role="status" className="sr-only">
        {announcement(view)}
      </p>
      <footer>
        <a href="#spike" className="underline">
          See the burial art spike
        </a>
      </footer>
    </main>
  );
}
