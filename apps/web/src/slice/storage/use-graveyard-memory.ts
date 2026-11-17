import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { lastWrittenAfter, storageCommands } from "../logic/storage-commands";
import type { MemorySnapshot } from "../logic/storage-commands";
import type { PageAction, PageModel } from "../page-state";
import type { GraveyardStore } from "./graveyard-store";

/**
 * Connects the page model to the Store (Req 3.1, 3.7, 5.2, 5.3). Every store call happens in an
 * effect, never during render.
 */
export function useGraveyardMemory(
  model: Pick<PageModel, "memory" | "graveyard">,
  store: GraveyardStore,
  initialText: string | null,
  dispatch: Dispatch<PageAction>,
): void {
  const lastWritten = useRef<string | null>(initialText);
  const prev = useRef<MemorySnapshot | null>(null);
  const { on, removal } = model.memory;
  const { graveyard } = model;

  useEffect(() => {
    const next: MemorySnapshot = { on, graveyard, removal, lastWritten: lastWritten.current };
    const commands = storageCommands(prev.current, next);
    prev.current = next;
    for (const command of commands) {
      let ok: boolean;
      if (command.kind === "write") {
        ok = store.write(command.text);
        if (ok) {
          dispatch({ type: "store-written", leftOut: command.leftOut, reason: command.reason });
        } else {
          dispatch({ type: "store-write-failed" });
        }
      } else {
        ok = store.remove();
        if (!ok && command.reason !== "write-failed") {
          dispatch({ type: "store-remove-failed", reason: command.reason });
        }
      }
      lastWritten.current = lastWrittenAfter(lastWritten.current, command, ok);
    }
  }, [on, removal, graveyard]);

  useEffect(() => {
    return store.onRemovedElsewhere(() => {
      lastWritten.current = null;
      dispatch({ type: "store-removed-elsewhere" });
    });
  }, [store]);
}
