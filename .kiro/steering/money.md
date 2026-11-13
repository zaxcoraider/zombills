---
inclusion: fileMatch
fileMatchPattern: "packages/core/**"
---

# Money Handling

## Integer cents — always

All monetary values are stored and computed as **integer cents** (`number` in TypeScript, always a whole number). Never use floating-point dollars.

```ts
// Correct
const amountCents: number = 999;   // $9.99

// Wrong — never do this
const amount: number = 9.99;
```

The `Transaction`, `Subscription`, and `Burial` types all use `amountCents` / `yearlyCostCents` / `yearlySavingCents` field names to make the unit explicit at every call site.

## Parsing amounts from CSV

Convert to cents immediately on parse, before the value enters any data structure. **Never pass the raw string through `parseFloat`** — it silently mishandles thousands separators (`"1,234.56"` → `1` cent), currency symbols (`"$9.99"` → `NaN`), accounting negatives (`"(9.99)"` → `NaN`), and European decimal commas (`"9,99"` → `900` cents).

Instead, parse directly from the string:

1. **Determine the decimal separator once per statement** (not per row). Inspect all non-empty amount values in the statement (not just the first few): if commas appear after a period they are thousands separators; if a comma appears as the last separator before 1–2 digits it is the decimal separator. Store this as statement-level config and apply it consistently to every row.

2. **Strip non-numeric characters** in this order:
   - Detect and record sign: leading/trailing `-`, or parentheses `(…)` → negative.
   - Strip currency symbols (`$`, `£`, `€`, `¥`, etc.) and whitespace.
   - Remove thousands separators (the non-decimal one identified in step 1).
   - Replace the decimal separator with `.` if it is a comma.

3. **Split on `.`** to get integer and fractional parts. The fractional part must be 0, 1, or 2 digits; pad to 2 digits. More than 2 fractional digits is a row error, never truncated or rounded.

4. **Combine**: `cents = integerPart * 100 + fractionalPart`, then apply sign.

5. **Reject unparseable values**: if the result is not a finite integer after the above steps, report it as a **row error** and skip the row. Never silently coerce to `0` or `NaN`.

The authoritative behaviour is defined in .kiro/specs/statement-parser/requirements.md (Requirements 4 and 5); implement from the spec, not from an example here.

## Computing yearly cost

```ts
const yearlyCostCents =
  cadence === "monthly" ? currentAmountCents * 12 :
  cadence === "weekly"  ? currentAmountCents * 52 :
  /* yearly */            currentAmountCents;
```

No fractional intermediate values. If a division is needed (e.g. averaging), round immediately with `Math.round`.

## Displaying amounts

Convert cents to a display string only at the UI layer (`apps/web`), never inside `packages/core`:

```ts
// In the UI only — use the transaction's own currency, not hard-coded USD
const display = (cents: number, currency: string) =>
  (cents / 100).toLocaleString(undefined, { style: "currency", currency });
```

## Currency

- Default currency is **USD**.
- The `Transaction` type carries a `currency: string` (ISO 4217) field.
- Multi-currency conversion is out of scope for this hackathon. If multiple currencies are detected, surface them to the user and process each currency independently — do not convert between them.

## Property tests

Every arithmetic path in `packages/core` that touches money must have a fast-check property test asserting:

- Totals equal the sum of their parts (no cents lost or gained).
- Yearly cost equals `amountCents × cadence factor` exactly.
- Results are always whole integers (no decimals).
- The amount parser round-trips: for any valid integer cent value, formatting then parsing returns the original value.
- The amount parser never returns `NaN`, `Infinity`, or a non-integer for any string input — it either returns a valid integer or throws `ParseError`.
