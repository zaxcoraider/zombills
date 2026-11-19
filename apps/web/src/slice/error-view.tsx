import { buttonVariant } from "./button-variants";
import { useFocusRequest } from "./graveyard/use-focus-request";
import { errorMessage } from "./logic/messages";
import type { PageError } from "./logic/messages";

export interface ErrorViewProps {
  sourceName: string | null;
  error: PageError;
  onStartAgain: () => void;
  /** Set when the Graveyard has records: "Open the graveyard" follows "Start again". */
  onOpenGraveyard?: (() => void) | undefined;
}

export function ErrorView({ sourceName, error, onStartAgain, onOpenGraveyard }: ErrorViewProps) {
  const headingRef = useFocusRequest("state-heading");
  const { summary, detail } = errorMessage(error);

  return (
    <div role="alert" className="flex flex-col gap-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold">
        {summary}
      </h2>
      {sourceName !== null ? <p>File: {sourceName}</p> : null}
      {detail !== null ? <p>{detail}</p> : null}
      <div className="flex flex-wrap gap-4">
        <button type="button" onClick={onStartAgain} {...buttonVariant("primary")}>
          Start again
        </button>
        {onOpenGraveyard !== undefined ? (
          <button type="button" onClick={onOpenGraveyard} {...buttonVariant("secondary")}>
            Open the graveyard
          </button>
        ) : null}
      </div>
    </div>
  );
}
