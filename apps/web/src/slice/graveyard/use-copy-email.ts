// Copy-to-clipboard for the Helper panel. Never moves focus, throws or logs; the email text
// lives only in the DOM and, on Copy, in the clipboard (cancel-helper Req 4.7, 8.3, 8.4).

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { COPY_FAILED_NOTICE, copiedNotice } from "../logic/cancel-text";
import { useAnnounce } from "./use-announce";

export const COPIED_MS = 2000;

export function useCopyEmail(
  text: string,
  displayName: string,
  emailRef: RefObject<HTMLElement | null>,
): { copied: boolean; onCopy: () => void } {
  const announce = useAnnounce();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  const succeed = useCallback(() => {
    if (unmounted.current) return;
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!unmounted.current) setCopied(false);
    }, COPIED_MS);
    announce(copiedNotice(displayName));
  }, [announce, displayName]);

  const fail = useCallback(() => {
    if (unmounted.current) return;
    try {
      const element = emailRef.current;
      if (element !== null) getSelection()?.selectAllChildren(element);
    } catch {
      // A missing selection API is ignored, and never logged.
    }
    announce(COPY_FAILED_NOTICE);
  }, [announce, emailRef]);

  const onCopy = useCallback(() => {
    const clipboard: { writeText?: unknown } | undefined = navigator.clipboard;
    if (typeof clipboard?.writeText !== "function") {
      fail();
      return;
    }
    try {
      const result: unknown = clipboard.writeText(text);
      Promise.resolve(result).then(succeed, fail);
    } catch {
      fail();
    }
  }, [text, succeed, fail]);

  return { copied, onCopy };
}
