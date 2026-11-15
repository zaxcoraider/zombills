import type { TextPart } from "../logic/label-text";
import { formatMoney } from "../logic/money";

export function Money({ cents, currency }: { cents: number; currency: string }) {
  return <span className="money">{formatMoney(cents, currency)}</span>;
}

export function TextLine({ parts }: { parts: readonly TextPart[] }) {
  return (
    <span>
      {parts.map((part, i) =>
        part.kind === "money" ? (
          <span key={i} className="money">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </span>
  );
}
