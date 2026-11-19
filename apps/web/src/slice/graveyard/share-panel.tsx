// The Share panel: make an image of the graveyard, preview it, and share or save it.
// Statement-derived text lives only in the DOM and the Image; nothing is stored or sent.

import { motion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AnswerRecord } from "../logic/graveyard";
import { SHARE_FILE_NAME, shareCardContent } from "../logic/share-card";
import {
  DOWNLOAD_STARTED,
  IMAGE_SHARED,
  MAKE_IMAGE,
  MAKE_IMAGE_AGAIN,
  MAKING_IMAGE,
  RENDER_FAILED,
  SAVE_FAILED,
  SAVE_IMAGE,
  SHARE_FAILED,
  SHARE_HEADING,
  SHARE_IMAGE,
  SHARE_INTRO,
} from "../logic/share-card-text";
import type { CurrencyTotal } from "../logic/totals";
import { buttonVariant } from "../button-variants";
import { downloadFile as defaultDownloadFile } from "./download-file";
import { helperPanelMotion } from "./motion";
import { currentNavigator, shareImage } from "./share-image";
import { useAnnounce } from "./use-announce";
import { useShareImage } from "./use-share-image";

export interface SharePanelProps {
  tombstones: readonly AnswerRecord[]; // haunt.tombstones
  savings: readonly CurrencyTotal[]; // haunt.savings
  reduceMotion: boolean;
  /** Default: downloadFile from download-file.ts (Req 5.6) */
  downloadFile?: (file: File, name: string) => void;
}

export function SharePanel({
  tombstones,
  savings,
  reduceMotion,
  downloadFile = defaultDownloadFile,
}: SharePanelProps) {
  const headingId = useId();
  const makeRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);
  const content = useMemo(() => shareCardContent(tombstones, savings), [tombstones, savings]);
  const { state, current, make } = useShareImage(content, () => {
    // Req 7.1 exception: the main button is about to go, so keep focus on the page.
    if (document.activeElement === mainRef.current) makeRef.current?.focus();
  });
  const announce = useAnnounce();
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy = state.run !== null || !current;
  const message = state.failed ? RENDER_FAILED : shareMessage;

  function onMake() {
    setShareMessage(null);
    make();
  }

  /** Calls the downloadFile prop; on a throw shows and announces SAVE_FAILED instead of `then`. */
  function trySave(file: File, then: () => void) {
    try {
      downloadFile(file, SHARE_FILE_NAME);
    } catch {
      setShareMessage(SAVE_FAILED);
      announce(SAVE_FAILED);
      return;
    }
    then();
  }

  function onMain() {
    const image = state.image;
    if (image === null || !current) return;
    setShareMessage(null);
    const file = image.file;
    if (image.path === "save") {
      trySave(file, () => announce(DOWNLOAD_STARTED));
      return;
    }
    // Nothing is awaited before navigator.share, so the click's user activation holds (Req 5.2).
    shareImage(currentNavigator() ?? {}, file, {
      shared: () => {
        if (mounted.current) announce(IMAGE_SHARED);
      },
      failed: () => {
        if (!mounted.current) return;
        trySave(file, () => {
          setShareMessage(SHARE_FAILED);
          announce(SHARE_FAILED);
        });
      },
    });
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-lg font-bold">
        {SHARE_HEADING}
      </h3>
      <p>{SHARE_INTRO}</p>
      <div>
        <button
          ref={makeRef}
          type="button"
          {...buttonVariant(state.image === null ? "primary" : "secondary")}
          aria-disabled={state.run !== null ? true : undefined}
          onClick={onMake}
        >
          {state.run !== null ? MAKING_IMAGE : state.madeOnce ? MAKE_IMAGE_AGAIN : MAKE_IMAGE}
        </button>
      </div>
      {state.image !== null ? (
        <div aria-busy={busy ? true : undefined} className="flex flex-col items-start gap-3">
          <motion.img
            key={state.image.dataUrl}
            src={state.image.dataUrl}
            alt={state.image.alt}
            width={1080}
            height={1080}
            className="block h-auto w-full max-w-[27rem]"
            {...helperPanelMotion(reduceMotion)}
          />
          <button
            ref={mainRef}
            type="button"
            {...buttonVariant("primary")}
            aria-disabled={current ? undefined : true}
            onClick={onMain}
          >
            {state.image.path === "share" ? SHARE_IMAGE : SAVE_IMAGE}
          </button>
        </div>
      ) : null}
      {message !== null ? <p>{message}</p> : null}
    </section>
  );
}
