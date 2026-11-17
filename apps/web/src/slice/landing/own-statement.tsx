import { DropZone } from "../drop-zone";
import { OWN_STATEMENT_HEADING } from "../logic/landing-text";
import { STATEMENT_TIP } from "../logic/memory-text";

export interface OwnStatementProps {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}

/** The drop area for the user's own statement, with the Tip. */
export function OwnStatement({ disabled, onFiles }: OwnStatementProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-fog/95 p-6">
      <h2 className="text-xl font-bold">{OWN_STATEMENT_HEADING}</h2>
      <p>{STATEMENT_TIP}</p>
      <DropZone disabled={disabled} onFiles={onFiles} />
    </section>
  );
}
