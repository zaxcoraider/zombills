import { StatementPanel } from "../statement/statement-panel";

export interface OwnStatementProps {
  disabled: boolean;
  reduceMotion: boolean;
  onFiles: (files: File[]) => void;
}

/** The Landing Statement panel: the drop area for the user's own statement (no Sample chips). */
export function OwnStatement({ disabled, reduceMotion, onFiles }: OwnStatementProps) {
  return (
    <StatementPanel
      place="landing"
      showHeading
      disabled={disabled}
      reduceMotion={reduceMotion}
      onFiles={onFiles}
      onChooseSample={() => {}}
    />
  );
}
