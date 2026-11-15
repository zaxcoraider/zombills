import type { Ref } from "react";
import { errorMessage } from "./logic/messages";
import type { PageError } from "./logic/messages";

export interface ErrorViewProps {
  sourceName: string | null;
  error: PageError;
  headingRef: Ref<HTMLHeadingElement>;
  onStartAgain: () => void;
}

export function ErrorView({ sourceName, error, headingRef, onStartAgain }: ErrorViewProps) {
  const { summary, detail } = errorMessage(error);

  return (
    <div role="alert" className="flex flex-col gap-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold">
        {summary}
      </h2>
      {sourceName !== null ? <p>File: {sourceName}</p> : null}
      {detail !== null ? <p>{detail}</p> : null}
      <div>
        <button
          type="button"
          onClick={onStartAgain}
          className="rounded border border-bone bg-fog px-4 py-2 text-bone"
        >
          Start again
        </button>
      </div>
    </div>
  );
}
