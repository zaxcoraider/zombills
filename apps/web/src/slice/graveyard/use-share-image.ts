// Render runs for the Share panel: one run at a time, results used only when they match the
// newest Share content, and late results dropped after unmount (share-card Req 4.4, 4.6, 4.7, 4.9).

import { useEffect, useReducer, useRef } from "react";
import { sameShareContent, shareCardAlt } from "../logic/share-card";
import type { ShareCardContent } from "../logic/share-card";
import { IMAGE_UPDATED, RENDER_FAILED, imageReadyNotice } from "../logic/share-card-text";
import { renderShareCard } from "./share-card-renderer";
import { currentNavigator, sharePathFor } from "./share-image";
import type { SharePath } from "./share-image";
import { useAnnounce } from "./use-announce";

export type ReadyImage = {
  readonly content: ShareCardContent; // what the Image was made from
  readonly dataUrl: string;
  readonly file: File;
  readonly alt: string; // shareCardAlt(content)
  readonly path: SharePath; // decided once, when the Image is used (Req 5.1)
};

type Trigger = "make" | "update";

export interface ShareImageState {
  image: ReadyImage | null;
  /** The render that is running, if any */
  run: { content: ShareCardContent; trigger: Trigger } | null;
  /** An Image has been made on this mount at least once (button text, Req 4.4, 4.7) */
  madeOnce: boolean;
  /** The last render rejected (Req 4.7) */
  failed: boolean;
}

type ShareImageAction =
  | { type: "start"; content: ShareCardContent; trigger: Trigger }
  | { type: "done"; image: ReadyImage }
  | { type: "fail" };

const INITIAL_STATE: ShareImageState = { image: null, run: null, madeOnce: false, failed: false };

function reducer(state: ShareImageState, action: ShareImageAction): ShareImageState {
  switch (action.type) {
    case "start":
      return { ...state, run: { content: action.content, trigger: action.trigger }, failed: false };
    case "done":
      return { image: action.image, run: null, madeOnce: true, failed: false };
    case "fail":
      return { ...state, image: null, run: null, failed: true };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

export function useShareImage(
  content: ShareCardContent,
  /** Called just before a rejected run is dispatched (focus rescue) */
  onBeforeFail?: () => void,
): { state: ShareImageState; current: boolean; make(): void } {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const announce = useAnnounce();
  const latest = useRef(content);
  // Written during render, not in an effect, so a run that settles between a render and its
  // effects already compares against the new content.
  latest.current = content;
  const runSeq = useRef(0);
  const beforeFail = useRef(onBeforeFail);
  beforeFail.current = onBeforeFail;

  function begin(started: ShareCardContent, trigger: Trigger): void {
    runSeq.current += 1;
    const seq = runSeq.current;
    dispatch({ type: "start", content: started, trigger });
    renderShareCard(started).then(
      (result) => {
        if (seq !== runSeq.current) return;
        if (!sameShareContent(started, latest.current)) {
          begin(latest.current, trigger);
          return;
        }
        const alt = shareCardAlt(started);
        const path = sharePathFor(currentNavigator(), result.file);
        dispatch({ type: "done", image: { content: started, ...result, alt, path } });
        announce(trigger === "make" ? imageReadyNotice(alt) : IMAGE_UPDATED);
      },
      () => {
        if (seq !== runSeq.current) return;
        beforeFail.current?.();
        dispatch({ type: "fail" });
        announce(RENDER_FAILED);
      },
    );
  }

  function make(): void {
    if (state.run === null) begin(latest.current, "make");
  }

  const { run, image } = state;
  useEffect(() => {
    if (run === null && image !== null && !sameShareContent(image.content, content)) {
      begin(content, "update");
    }
    // `begin` reads only refs plus stable dispatch and announce; the trigger is these three values.
  }, [content, run, image]);

  useEffect(
    () => () => {
      runSeq.current += 1;
    },
    [],
  );

  const current = image !== null && sameShareContent(image.content, content);
  return { state, current, make };
}
