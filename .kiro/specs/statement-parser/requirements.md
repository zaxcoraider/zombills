# Requirements Document

## Introduction

The `statement-parser` module lives in `packages/core` (`@zombills/core`) and is the entry point for all statement data in the Zombills application. It accepts a raw CSV string — either uploaded by the user or provided as a built-in sample — and returns a structured result containing a `Transaction[]`, any row-level errors encountered, and, when column auto-detection fails, a column-mapping descriptor so the web UI can ask the user to map columns manually.

The module is pure TypeScript with no network calls and no DOM access. All monetary values are stored as integer cents: positive values are money out (debits), negative values are money in (credits). Statement data never leaves the browser.

---

## Glossary

- **Parser**: The `statement-parser` module within `packages/core`.
- **Transaction**: A single debit or credit row from the statement, typed as `{ date: string; description: string; amountCents: number; currency: string }` where `date` is ISO `yyyy-mm-dd`, `amountCents` is positive for money out (debit) and negative for money in (credit).
- **ParseResult**: A discriminated union returned by the Parser, with a `status` field of `"mapped"` (all columns resolved, rows parsed), `"mapping-required"` (column mapping absent or incomplete), or `"error"` (statement-level failure that prevents any parsing).
- **MappedResult**: A `ParseResult` with `status: "mapped"` containing `transactions: Transaction[]`, `rowErrors: RowError[]`, `detectedDateFormat: DateFormatInfo`, and `detectedSignConvention: SignConvention`.
- **MappingRequiredResult**: A `ParseResult` with `status: "mapping-required"` containing `columns: string[]`, optional `validationErrors`, and `rowErrors: RowError[]`.
- **ErrorResult**: A `ParseResult` with `status: "error"` containing `reason: string` describing the statement-level failure. Used for empty input, conflicting separator patterns, and invalid option values. `parseStatement` SHALL NOT throw for these cases.
- **ColumnMap**: A record specifying how CSV header names map to canonical fields. For `SignedAmountLayout` it must include `date`, `description`, and `amount`. For `DebitCreditLayout` it must include `date`, `description`, `debit`, and `credit`. The `currency` field is optional in both layouts.
- **RowError**: An object `{ rowIndex: number; rawRow: string; reason: string }` recording a row that could not be parsed. Row numbering is 1-based relative to the header row (first data row = row 1). Each `RowError` SHALL include the 1-based row number and a description identifying which field failed and why.
- **DecimalSeparator**: Either `"."` or `","`, determined once per statement from the first several amount values before any row is parsed.
- **DateFormat**: One of `"yyyy-mm-dd"`, `"dd/mm/yyyy"`, or `"mm/dd/yyyy"`, determined once per statement from the first parseable date values before any row is parsed.
- **DateFormatInfo**: An object `{ format: DateFormat; assumed: boolean }` returned in `MappedResult`. `assumed` is `true` when the format could not be disambiguated from the data and a default was applied.
- **SignConvention**: Either `"positive-out"` (positive raw value = money out) or `"negative-out"` (negative raw value = money out), determined once per statement for `SignedAmountLayout`.
- **SignedAmountLayout**: A CSV layout where a single column holds positive and negative values representing debits and credits respectively.
- **DebitCreditLayout**: A CSV layout where separate columns hold debit amounts and credit amounts (one of which is empty per row).
- **ParseError**: A typed error class used only within the Parser to signal an unparseable value. Never propagated outside a row handler.

---

## Requirements

### Requirement 1: Accept a raw CSV string and return a ParseResult

**User Story:** As the Zombills web UI, I want to pass a raw CSV string to the Parser and receive a structured result, so that I can display transactions or prompt the user for column mapping without handling raw text myself.

#### Acceptance Criteria

1. THE Parser SHALL export a function `parseStatement(csv: string, options?: ParseOptions): ParseResult`.
2. THE Parser SHALL accept an optional `ParseOptions` object containing: `columnMap?: ColumnMap`, `currency?: string` (default `"USD"`), and `signConvention?: "positive-out" | "negative-out"` (overrides auto-detection for `SignedAmountLayout`).
3. THE Parser SHALL define `ParseResult` as a discriminated union on `status`: `"mapped"`, `"mapping-required"`, or `"error"`.
4. IF `csv` is an empty string or contains only whitespace, THEN THE Parser SHALL return a `ParseResult` with `status: "error"` and a `reason` describing the empty input; `parseStatement` SHALL NOT throw.
5. IF `csv` contains at least one non-empty row and `options.columnMap` is not provided or is missing one or more required field mappings, THEN THE Parser SHALL return a `ParseResult` with `status: "mapping-required"` and a `columns` array containing every header string extracted from the detected header row.
6. THE Parser SHALL use Papa Parse to split the CSV into rows and cells; no custom CSV tokenizer shall be written.
7. THE Parser SHALL be a pure function: given the same `csv` and `options`, it SHALL always return the same `ParseResult`.

---

### Requirement 2: Auto-detect column layout from headers

**User Story:** As a user who exports a statement from their bank, I want the Parser to figure out which columns are date, description, and amount without me having to configure anything, so that I can drop in a file and immediately see results.

#### Acceptance Criteria

1. WHEN the detected header row contains one or more columns whose names case-insensitively match any of `["date", "transaction date", "posted date", "value date", "trans. date"]`, THE Parser SHALL map the first matching column (by left-to-right header order) to the `date` field.
2. WHEN the detected header row contains one or more columns whose names case-insensitively match any of `["description", "memo", "narrative", "details", "merchant", "payee", "transaction description"]`, THE Parser SHALL map the first matching column (by left-to-right header order) to the `description` field.
3. WHEN the detected header row contains one or more columns whose names case-insensitively match any of `["amount", "transaction amount", "net amount", "value"]`, THE Parser SHALL treat the layout as `SignedAmountLayout` and map the first matching column (by left-to-right header order) to `amount`.
4. WHEN the detected header row contains one or more columns matching any of `["debit", "debit amount", "withdrawal", "withdrawals"]` (case-insensitive) AND one or more columns matching any of `["credit", "credit amount", "deposit", "deposits"]` (case-insensitive), THE Parser SHALL treat the layout as `DebitCreditLayout` and map the first matching debit column and the first matching credit column (each by left-to-right header order) to their respective fields.
5. IF the detected header row satisfies both Criterion 3 and Criterion 4 simultaneously, THEN THE Parser SHALL treat the layout as `DebitCreditLayout` and SHALL NOT apply `SignedAmountLayout`.
6. WHEN auto-detection resolves all required columns (date, description, and either amount or both debit and credit), THE Parser SHALL proceed to parse rows and return a `ParseResult` with `status: "mapped"`.
7. WHEN auto-detection cannot resolve one or more required columns, THE Parser SHALL return a `ParseResult` with `status: "mapping-required"` containing the full list of detected header names in `columns`.
8. WHEN `options.columnMap` is provided, THE Parser SHALL use it in place of auto-detection; auto-detection SHALL NOT run.
9. IF `options.columnMap` references a column name that does not exist in the detected header row, THEN THE Parser SHALL return a `ParseResult` with `status: "error"` and a `reason` identifying the missing column name.

---

### Requirement 3: Determine the date format once per statement

**User Story:** As the Zombills system, I want all dates in a statement parsed with a single consistent format decision, so that rows are not misread when the same file contains dates like "01/02/2024" (which could be Jan 2 or Feb 1). The UI also needs to know whether the format was assumed so it can offer the user a way to correct it.

#### Acceptance Criteria

1. WHEN date parsing begins, THE Parser SHALL inspect the first up to ten date cells that individually match at least one of the three supported formats (`"yyyy-mm-dd"`, `"dd/mm/yyyy"`, or `"mm/dd/yyyy"`) and use those cells as the candidate set for format determination.
2. WHEN all candidate date cells match `yyyy-mm-dd` unambiguously (separator is `-`, year component is 4 digits in the leftmost position), THE Parser SHALL record `DateFormat` as `"yyyy-mm-dd"` with `assumed: false`.
3. WHEN candidate date cells use `/` as a separator and the leftmost numeric component exceeds 12 in at least one candidate cell, THE Parser SHALL record `DateFormat` as `"dd/mm/yyyy"` with `assumed: false` (a day value above 12 can only appear in the leftmost position in `dd/mm/yyyy`).
4. WHEN candidate date cells use `/` as a separator and the middle numeric component exceeds 12 in at least one candidate cell, THE Parser SHALL record `DateFormat` as `"mm/dd/yyyy"` with `assumed: false` (a month value above 12 is impossible, so a middle component above 12 means the leftmost is the month).
5. IF the candidate set is non-empty and no component value exceeds 12 in any candidate cell (both `dd/mm/yyyy` and `mm/dd/yyyy` remain possible), THEN THE Parser SHALL default `DateFormat` to `"mm/dd/yyyy"` with `assumed: true`.
6. WHEN the `DateFormat` is determined, THE Parser SHALL apply it to every subsequent date cell in the statement without re-evaluating per row, and SHALL include a `DateFormatInfo` object `{ format, assumed }` in the `MappedResult`.
7. THE Parser SHALL output every date as an ISO `yyyy-mm-dd` string regardless of the input format.
8. IF a date cell does not conform to the resolved `DateFormat`, THEN THE Parser SHALL record a `RowError` for that row and continue parsing remaining rows. *(PBT: round-trip — any date formatted in the detected format then parsed SHALL return the original `yyyy-mm-dd` string.)*
9. IF the candidate set contains zero cells (no date cell in the statement matches any supported format), THEN THE Parser SHALL record a `RowError` for every date cell in the statement, leave `DateFormat` unset, and continue parsing non-date fields.

---

### Requirement 4: Determine the decimal separator once per statement

**User Story:** As the Zombills system, I want the decimal separator to be decided from the statement as a whole, not row by row, so that amounts like "1,234.56" and "9,99" are each parsed correctly within their respective statement formats.

#### Acceptance Criteria

1. WHEN amount parsing begins, THE Parser SHALL inspect the first up to 10 non-empty amount cells in the statement and determine whether the `DecimalSeparator` is `"."` or `","`.
2. WHEN at least one candidate cell contains a period that follows a comma (e.g. `"1,234.56"`), THE Parser SHALL record `DecimalSeparator` as `"."`.
3. WHEN at least one candidate cell contains a comma that follows a period (e.g. `"1.234,56"`), THE Parser SHALL record `DecimalSeparator` as `","`.
4. WHEN a candidate cell contains a comma or period that is followed by exactly 1 or 2 digits at the end of the cell (e.g. `"9,99"` or `"9.9"`), THE Parser SHALL treat that punctuation character as the decimal separator for that cell; a punctuation character followed by exactly 3 digits at the end of the cell is ambiguous and SHALL NOT by itself determine the separator.
5. IF both a `"."` indicator and a `","` indicator are found among the candidate cells (contradictory patterns), THEN THE Parser SHALL return a `ParseResult` with `status: "error"` and a `reason` indicating conflicting decimal separator patterns; `parseStatement` SHALL NOT throw.
6. WHEN no separator disambiguation is possible among the candidate cells (all candidate cells contain only digits, or contain a punctuation character followed by exactly 3 trailing digits with no corroborating evidence), THE Parser SHALL default `DecimalSeparator` to `"."`.
7. WHEN `DecimalSeparator` has been determined, THE Parser SHALL apply it uniformly to every amount cell in the statement without re-evaluating per row. *(PBT: consistency — every amount cell in a statement with the same separator pattern SHALL produce the same `DecimalSeparator` decision regardless of row order.)*
8. *(PBT: European round-trip — for any integer cent value formatted as a European-style string (e.g. `"1.234,56"` or `"9,99"`), parsing with `DecimalSeparator = ","` SHALL return the original cent value.)*

---

### Requirement 5: Parse amount cells into integer cents

**User Story:** As the Zombills system, I want every amount value stored as an exact integer number of cents, so that totals never accumulate floating-point rounding errors.

#### Acceptance Criteria

1. WHEN parsing an amount cell, THE Parser SHALL strip all leading and trailing whitespace characters (Unicode general categories Zs, Zl, Zp, and ASCII tab, newline, carriage-return) before any other processing.
2. WHEN an amount cell, after whitespace stripping, begins with exactly one `-` character, ends with exactly one `-` character, or is wrapped in exactly one matching pair of parentheses `(…)` with no `-` present, THE Parser SHALL treat the value as negative; IF the cell contains any other combination of `-` and `(…)` sign indicators (e.g. `--5`, `(-5)`, `(5`, `5)`), THEN THE Parser SHALL record a `RowError` for that row and skip the row.
3. WHEN an amount cell contains a currency symbol from Unicode general category Sc (including `$`, `£`, `€`, `¥`), THE Parser SHALL strip that symbol before numeric conversion.
4. WHEN the `DecimalSeparator` is `"."`, THE Parser SHALL treat commas as thousands separators and remove them before conversion.
5. WHEN the `DecimalSeparator` is `","`, THE Parser SHALL treat periods as thousands separators and remove them, then replace the comma with `"."` before conversion.
6. WHEN an amount cell contains exactly 0, 1, or 2 literal digits after the decimal point, THE Parser SHALL convert to cents by multiplying the integer part by 100 and adding the fractional part (padded to 2 digits on the right).
7. WHEN an amount cell contains more than 2 literal digits after the decimal point (including trailing zeros, e.g. `1.050` counts as 3 decimal digits), THE Parser SHALL record a `RowError` for that row and skip the row; THE Parser SHALL NOT truncate or round the value.
8. WHEN an amount cell, after stripping whitespace, sign indicators, currency symbols, and separators, contains any character that is not a digit or a single decimal point, THE Parser SHALL record a `RowError` for that row and skip the row; THE Parser SHALL NOT coerce the value to 0.
9. WHEN an amount cell is empty, THE Parser SHALL record a `RowError` for that row and skip the row.
10. IF an amount cell contains whitespace characters between any two of its components (sign, currency symbol, digits, or separators) after outer whitespace has been stripped, THEN THE Parser SHALL record a `RowError` for that row and skip the row.
11. IF the absolute value of the resulting `amountCents` would exceed 999_999_9900 (ten billion cents), THEN THE Parser SHALL record a `RowError` for that row and skip the row.
12. THE Parser SHALL return only whole-integer `amountCents` values; no `NaN`, no `Infinity`, no non-integer results shall appear in `Transaction.amountCents`. *(PBT: amount parser never returns NaN, Infinity, or non-integer for any string input — it either returns a valid integer or throws ParseError.)*
13. *(PBT: round-trip — for any integer cent value in the range −999_999_9900 to 999_999_9900, formatting it as a decimal dollar string with 2 decimal places and then parsing it with `DecimalSeparator = "."` SHALL return the original cent value.)*

---

### Requirement 6: Handle the SignedAmountLayout

**User Story:** As a user whose bank exports a single signed "Amount" column, I want the Parser to infer debit or credit from the sign and correctly handle banks that flip the convention, so that my transactions always have the right sign regardless of which bank the statement came from.

#### Acceptance Criteria

1. WHEN the layout is `SignedAmountLayout` and no `options.signConvention` is provided, THE Parser SHALL inspect the non-zero amount cells across the statement and record the `SignConvention` as `"positive-out"` if the majority of non-zero raw values are positive, or `"negative-out"` if the majority are negative.
2. WHEN `options.signConvention` is provided, THE Parser SHALL use it as the `SignConvention` and SHALL NOT perform majority inspection.
3. WHEN the `SignConvention` is `"positive-out"` and the parsed raw `amountCents` for a row is positive, THE Parser SHALL store `Transaction.amountCents` as a positive value (money out).
4. WHEN the `SignConvention` is `"positive-out"` and the parsed raw `amountCents` for a row is negative, THE Parser SHALL store `Transaction.amountCents` as a negative value (money in).
5. WHEN the `SignConvention` is `"negative-out"` and the parsed raw `amountCents` for a row is negative, THE Parser SHALL store `Transaction.amountCents` as a positive value (money out, negated to positive).
6. WHEN the `SignConvention` is `"negative-out"` and the parsed raw `amountCents` for a row is positive, THE Parser SHALL store `Transaction.amountCents` as a negative value (money in, negated to negative).
7. WHEN the layout is `SignedAmountLayout` and `amountCents` is zero, THE Parser SHALL include the row as a valid `Transaction` with `amountCents = 0` regardless of `SignConvention`.
8. THE Parser SHALL include the resolved `SignConvention` in the `MappedResult` so the UI can display it and offer the user an override.
9. IF the layout is `SignedAmountLayout` and an amount cell value cannot be parsed as an integer number of cents (e.g. is empty, non-numeric, or would exceed the magnitude limit), THEN THE Parser SHALL record a `RowError` and SHALL NOT produce a `Transaction` for that row.
10. WHEN the layout is `SignedAmountLayout` and an amount cell contains more than 2 literal decimal places, THE Parser SHALL record a `RowError` and SHALL NOT produce a `Transaction` for that row.

---

### Requirement 7: Handle the DebitCreditLayout

**User Story:** As a user whose bank exports separate "Debit" and "Credit" columns, I want the Parser to combine them into a single signed amount, so that all transactions share the same `amountCents` representation where positive means money out and negative means money in.

#### Acceptance Criteria

1. WHEN the layout is `DebitCreditLayout` and the debit cell contains at least one non-whitespace character and the credit cell contains only whitespace or is empty, THE Parser SHALL parse the numeric value from the debit cell and store it as a **positive** `amountCents` integer (money out).
2. WHEN the layout is `DebitCreditLayout` and the credit cell contains at least one non-whitespace character and the debit cell contains only whitespace or is empty, THE Parser SHALL parse the numeric value from the credit cell and store it as a **negative** `amountCents` integer (money in); if the bank already wrote the credit as a negative number in the column, THE Parser SHALL negate it again so the result is negative.
3. WHEN the layout is `DebitCreditLayout` and both the debit cell and the credit cell each contain at least one non-whitespace character, THE Parser SHALL record a `RowError` identifying the row index and skip that row without producing a `Transaction`.
4. WHEN the layout is `DebitCreditLayout` and both the debit cell and the credit cell contain only whitespace or are empty, THE Parser SHALL record a `RowError` identifying the row index and skip that row without producing a `Transaction`.
5. IF the layout is `DebitCreditLayout` and the non-empty cell designated for parsing contains a value that cannot be converted to a finite numeric amount, THEN THE Parser SHALL record a `RowError` identifying the row index and skip that row without producing a `Transaction`.

---

### Requirement 8: Collect row errors without aborting the parse

**User Story:** As the Zombills web UI, I want to receive both the valid transactions and a list of rows that failed to parse, so that I can show the user what was imported and flag anything suspicious without discarding good data.

#### Acceptance Criteria

1. WHEN a data row cannot be converted into a valid transaction (e.g. unparseable amount, unparseable date, or missing required cell), THE Parser SHALL append a `RowError` to the result and continue processing the next row; each `RowError` SHALL include at minimum the 1-based row number of the failing row and a description identifying which field failed and why.
2. THE Parser SHALL NOT throw an exception for a row-level error; `parseStatement` SHALL only throw if the `csv` argument is not a string (a type contract violation), and SHALL return a `ParseResult` with `status: "error"` for all other failure modes.
3. WHEN parsing is complete, THE Parser SHALL include all accumulated `RowError` objects in the returned `MappedResult.rowErrors` array.
4. WHEN no row errors occur, THE Parser SHALL return an empty `rowErrors` array.
5. WHEN every data row produces a `RowError`, THE Parser SHALL return a `ParseResult` with `status: "mapped"`, an empty `transactions` array, and a fully populated `rowErrors` array. *(PBT: for any CSV input, the count of transactions plus the count of row errors SHALL equal the total number of data rows — rows after the detected header row and before any trailing blank rows.)*

---

### Requirement 9: Column-mapping fallback

**User Story:** As the Zombills web UI, I want to know which columns are available when auto-detection fails, so that I can present a mapping UI to the user and re-submit with an explicit ColumnMap.

#### Acceptance Criteria

1. WHEN THE Parser returns a `ParseResult` with `status: "mapping-required"`, the result SHALL contain a `columns` array listing every header name found in the detected header row, including blank and duplicate entries, in the order they appear left to right.
2. WHEN the UI submits a `ColumnMap` via `options.columnMap` in a subsequent call with the same CSV content, and the supplied `ColumnMap` satisfies the layout requirements below, THE Parser SHALL use the user-supplied mapping and return a `ParseResult` with `status: "mapped"`.
3. A valid `ColumnMap` for `SignedAmountLayout` SHALL contain values for `date`, `description`, and `amount`, each referencing a column name present in `columns`. A valid `ColumnMap` for `DebitCreditLayout` SHALL contain values for `date`, `description`, `debit`, and `credit`, each referencing a column name present in `columns`. The `currency` field is optional in both layouts.
4. IF the supplied `ColumnMap` references a column name that is not present in the `columns` array, or omits one or more required fields for the specified layout, THEN THE Parser SHALL return a `ParseResult` with `status: "mapping-required"` containing the original `columns` array and a `validationErrors` array with one entry per invalid or missing mapping, each entry identifying the semantic role and the offending column name.
5. WHEN the Parser receives a parse call that includes `options.columnMap`, THE Parser SHALL validate the `ColumnMap` against the `columns` array before reading any data rows, and SHALL NOT modify any previously accumulated parse state if validation fails.

---

### Requirement 10: Currency handling

**User Story:** As the Zombills system, I want every `Transaction` to carry an ISO 4217 currency code, so that the UI can display amounts correctly and future multi-currency support can distinguish statements.

#### Acceptance Criteria

1. IF `options.currency` is provided and is a valid ISO 4217 alpha-3 code (exactly 3 uppercase ASCII letters), THEN THE Parser SHALL set `Transaction.currency` to that value for every row that does not have a per-row currency column value.
2. IF `options.currency` is not provided, THEN THE Parser SHALL default `Transaction.currency` to `"USD"` for every row that does not have a per-row currency column value.
3. IF `options.currency` is provided but is not a valid ISO 4217 alpha-3 code, THEN THE Parser SHALL return a `ParseResult` with `status: "error"` and a `reason` indicating the invalid currency code; `parseStatement` SHALL NOT throw and SHALL NOT process any rows.
4. IF a CSV column named `"currency"` or `"ccy"` (case-insensitive) is present and a row's currency cell contains a valid ISO 4217 alpha-3 code, THEN THE Parser SHALL set `Transaction.currency` to that cell's value for that row, overriding `options.currency`.
5. IF a CSV column named `"currency"` or `"ccy"` (case-insensitive) is present and a row's currency cell is empty, THEN THE Parser SHALL set `Transaction.currency` to `options.currency` if provided, or `"USD"` otherwise, and SHALL NOT produce a `RowError` for that row.
6. IF a CSV column named `"currency"` or `"ccy"` (case-insensitive) is present and a row's currency cell is non-empty but not a valid ISO 4217 alpha-3 code, THEN THE Parser SHALL produce a `RowError` for that row indicating the invalid currency value and SHALL NOT set `Transaction.currency` for that row.

---

### Requirement 11: Header row detection

**User Story:** As a user whose bank export includes account-info lines above the actual column headers, I want the Parser to find the real header row automatically, so that those metadata lines are ignored rather than treated as bad data.

#### Acceptance Criteria

1. WHEN the Parser begins processing a CSV, THE Parser SHALL scan the first up to 20 non-empty rows searching for the first row that contains at least one cell case-insensitively matching any known header name from the date, description, amount, debit, or credit recognition lists defined in Requirement 2.
2. WHEN a matching row is found within the first 20 non-empty rows, THE Parser SHALL treat that row as the header row and SHALL treat all rows above it as preamble; preamble rows SHALL be ignored and SHALL NOT be counted as data rows.
3. WHEN no matching row is found within the first 20 non-empty rows, THE Parser SHALL return a `ParseResult` with `status: "mapping-required"` with a `columns` array containing the cells of the first non-empty row, so the user can manually identify which row is the header.
4. THE Parser SHALL NOT count preamble rows in the data-row total used by the row-count invariant in Requirement 12.

---

### Requirement 12: No network calls and no DOM access

**User Story:** As the Zombills privacy contract, I want the Parser to be a pure in-browser module with no network calls, so that statement data never leaves the user's device.

#### Acceptance Criteria

1. THE Parser SHALL NOT contain any call to `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, or any other network API.
2. THE Parser SHALL NOT access `document`, `window`, `navigator`, or any other DOM or browser-global API.
3. WHEN the Parser module is imported in a Node.js Vitest environment with no browser polyfills loaded, THE Parser SHALL load and execute its exported functions without throwing a ReferenceError or any other runtime error caused by a missing browser global.
4. IF the Parser source code is statically analysed and any reference to a network API (`fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`) or a DOM/browser-global API (`document`, `window`, `navigator`) is found, THEN THE Parser SHALL fail the static analysis check, producing an error indicating the offending API reference.

---

### Requirement 13: Parser round-trip and invariant property tests

**User Story:** As the Zombills test suite, I want property-based tests covering the Parser's core invariants, so that fast-check can generate edge-case inputs and confirm correctness automatically.

#### Acceptance Criteria

1. *(PBT: row-count invariant)* FOR ALL CSV strings that `parseStatement` accepts without returning `status: "error"` — where N is the count of rows after the detected header row — `transactions.length + rowErrors.length` SHALL equal N.
2. *(PBT: amount parser never crashes)* FOR ALL arbitrary strings passed to the internal `parseAmountCents` function, the function SHALL either return a finite integer or throw a `ParseError`; it SHALL NOT return `NaN`, `Infinity`, or a non-integer, and SHALL NOT throw any other error type.
3. *(PBT: US amount round-trip)* FOR ALL integer cent values in the range −999_999_9900 to 999_999_9900, formatting the value as `(cents / 100).toFixed(2)` and then parsing with `DecimalSeparator = "."` SHALL return the original cent value.
4. *(PBT: European amount round-trip)* FOR ALL integer cent values in the range −999_999_9900 to 999_999_9900, formatting the value European-style (e.g. `"1.234,56"` or `"9,99"`) and then parsing with `DecimalSeparator = ","` SHALL return the original cent value.
5. *(PBT: date round-trip)* FOR ALL `yyyy-mm-dd` strings representing valid calendar dates, calling the parser's date-parse function with that string as input and `DateFormat = "yyyy-mm-dd"` SHALL return the original `yyyy-mm-dd` string unchanged.
6. *(PBT: amountCents sign invariant)* FOR ALL `Transaction` objects in any `MappedResult`, `Transaction.amountCents` SHALL be a whole integer; debits SHALL be positive and credits SHALL be negative; `Number.isInteger(transaction.amountCents)` SHALL be `true`.
7. *(PBT: parser is deterministic)* FOR ALL CSV strings and `ParseOptions` values, calling `parseStatement` twice with identical arguments SHALL return results that are deeply equal — matching transaction count, identical field values in identical order, and an identical error list.
8. *(PBT: sign convention consistency)* FOR ALL `SignedAmountLayout` statements where the sign convention is auto-detected, every non-zero `Transaction.amountCents` in the result SHALL have a sign consistent with the returned `detectedSignConvention`.
