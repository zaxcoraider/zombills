# Requirements Document

## Introduction

The `statement-parser` module lives in `packages/core` (`@zombills/core`) and is the entry point for all statement data in the Zombills application. It accepts a raw CSV string — either uploaded by the user or provided as a built-in sample — and returns a structured result containing a `Transaction[]`, any row-level errors encountered, and, when column auto-detection fails, a column-mapping descriptor so the web UI can ask the user to map columns manually.

The module is pure TypeScript with no network calls and no DOM access. All monetary values are stored as integer cents: positive values are money out (debits), negative values are money in (credits). Statement data never leaves the browser.

CSV files with no header row are out of scope for this spec. Such files fall through to `status: "mapping-required"` via Requirement 11.3.

---

## Glossary

- **Parser**: The `statement-parser` module within `packages/core`.
- **Transaction**: A single debit or credit row from the statement, typed as `{ date: string; description: string; amountCents: number; currency: string }` where `date` is ISO `yyyy-mm-dd`, `amountCents` is positive for money out (debit) and negative for money in (credit).
- **ParseResult**: A discriminated union returned by the Parser, with a `status` field of `"mapped"` (all columns resolved, rows parsed), `"mapping-required"` (column mapping absent or incomplete), or `"error"` (statement-level failure that prevents any parsing).
- **MappedResult**: A `ParseResult` with `status: "mapped"` containing `transactions: Transaction[]`, `rowErrors: RowError[]`, `detectedDateFormat: DateFormatInfo | null`, `detectedSignConvention: SignConventionInfo | null`, and `detectedCurrency: CurrencyInfo`. `detectedDateFormat` is `null` only when no date cell matches any supported format (Requirement 3.9). `detectedSignConvention` is `null` for `DebitCreditLayout`, where no sign convention applies. `detectedCurrency` is always present.
- **MappingRequiredResult**: A `ParseResult` with `status: "mapping-required"` containing `columns: string[]`, optional `validationErrors`, and `rowErrors: RowError[]`.
- **ErrorResult**: A `ParseResult` with `status: "error"` containing `reason: string` describing the statement-level failure. Used for empty input, conflicting separator patterns, conflicting date formats, and invalid option values. `parseStatement` SHALL NOT throw for these cases.
- **ColumnMap**: A record specifying how CSV header names map to canonical fields. For `SignedAmountLayout` it must include `date`, `description`, and `amount`. For `DebitCreditLayout` it must include `date`, `description`, `debit`, and `credit`. The `currency` field is optional in both layouts.
- **RowError**: An object `{ rowIndex: number; rawRow: string; reason: string }` recording a row that could not be parsed. Row numbering is 1-based relative to the header row (first data row = row 1). Each `RowError` SHALL include the 1-based row number and a description identifying which field failed and why.
- **Data row**: Any row after the detected header row that is not fully blank. A row is fully blank when every cell is empty or contains only whitespace. Fully blank rows anywhere after the header row are skipped: they produce neither a `Transaction` nor a `RowError` and are not counted as data rows.
- **DecimalSeparator**: Either `"."` or `","`, determined once per statement from all non-empty amount cells before any row is parsed.
- **DateFormat**: One of `"yyyy-mm-dd"`, `"dd/mm/yyyy"`, `"mm/dd/yyyy"`, `"dd.mm.yyyy"`, or `"dd-mm-yyyy"`, determined once per statement from all date cells before any row is parsed. The format names describe component order and separator only. In every format, day and month MAY be written with or without zero padding (e.g. `"1/5/2026"`, `"2026-5-1"`). In the four day-first and month-first formats, the year MAY be written with four digits or two digits; a two-digit year `yy` is read as `20yy`. In `"yyyy-mm-dd"` the year is always four digits. `"dd.mm.yyyy"` and `"dd-mm-yyyy"` are always day-first.
- **DateFormatInfo**: An object `{ format: DateFormat; assumed: boolean }` returned in `MappedResult`. `assumed` is `true` when the format could not be disambiguated from the data and a default was applied.
- **SignConvention**: Either `"positive-out"` (positive raw value = money out) or `"negative-out"` (negative raw value = money out), determined once per statement for `SignedAmountLayout`.
- **SignConventionInfo**: An object `{ convention: SignConvention; assumed: boolean }` returned in `MappedResult`. `assumed` is `true` when the convention could not be decided from the data (equal counts of positive and negative non-zero values) and the default `"positive-out"` was applied.
- **CurrencyInfo**: An object `{ code: string; source: CurrencySource }` returned in `MappedResult`. `code` is the statement currency as an upper-case ISO 4217 alpha-3 code. `source` is `"option"`, `"column"`, `"symbol"` or `"default"` and records how the code was decided (Requirement 10), so the UI can show where the currency came from and offer an override.
- **Statement currency**: The single currency the Parser assigns to every row that has no currency of its own, decided once per statement (Requirement 10). A row with a valid currency cell keeps its own currency.
- **SignedAmountLayout**: A CSV layout where a single column holds positive and negative values representing debits and credits respectively.
- **DebitCreditLayout**: A CSV layout where separate columns hold debit amounts and credit amounts (one of which is empty per row).
- **ParseError**: A typed error class used only within the Parser to signal an unparseable value. Never propagated outside a row handler.

---

## Requirements

### Requirement 1: Accept a raw CSV string and return a ParseResult

**User Story:** As the Zombills web UI, I want to pass a raw CSV string to the Parser and receive a structured result, so that I can display transactions or prompt the user for column mapping without handling raw text myself.

#### Acceptance Criteria

1. THE Parser SHALL export a function `parseStatement(csv: string, options?: ParseOptions): ParseResult`.
2. THE Parser SHALL accept an optional `ParseOptions` object containing: `columnMap?: ColumnMap`, `currency?: string` (when omitted, the statement currency is decided as described in Requirement 10 and is `"USD"` when nothing else applies), and `signConvention?: "positive-out" | "negative-out"` (overrides auto-detection for `SignedAmountLayout`).
3. THE Parser SHALL define `ParseResult` as a discriminated union on `status`: `"mapped"`, `"mapping-required"`, or `"error"`.
4. IF `csv` is an empty string or contains only whitespace, THEN THE Parser SHALL return a `ParseResult` with `status: "error"` and a `reason` describing the empty input; `parseStatement` SHALL NOT throw.
5. IF `csv` contains at least one non-empty row, `options.columnMap` is not provided, AND auto-detection (Requirement 2) cannot resolve all required columns, THEN THE Parser SHALL return a `ParseResult` with `status: "mapping-required"` and a `columns` array containing every header string extracted from the detected header row.
6. THE Parser SHALL use Papa Parse to split the CSV into rows and cells, with Papa Parse delimiter auto-detection enabled for comma (`,`), semicolon (`;`), and tab (`\t`); no custom CSV tokenizer shall be written. Before any header detection, THE Parser SHALL strip a leading UTF-8 byte order mark (U+FEFF) from `csv` if one is present.
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
9. IF `options.columnMap` references a column name that does not exist in the detected header row, THEN THE Parser SHALL return a `ParseResult` with `status: "mapping-required"` and a `validationErrors` array identifying the missing column name, as specified in Requirement 9.4.
10. WHEN matching header names against the recognition lists in Criteria 1–4, THE Parser SHALL first trim leading and trailing whitespace from each header name and then compare case-insensitively (e.g. `"  Posted Date "` matches `"posted date"`).

---

### Requirement 3: Determine the date format once per statement

**User Story:** As the Zombills system, I want all dates in a statement parsed with a single consistent format decision, so that rows are not misread when the same file contains dates like "01/02/2024" (which could be Jan 2 or Feb 1). The UI also needs to know whether the format was assumed so it can offer the user a way to correct it.

#### Acceptance Criteria

1. WHEN date parsing begins, THE Parser SHALL inspect ALL date cells in the statement that individually match at least one of the supported formats (`"yyyy-mm-dd"`, `"dd/mm/yyyy"`, `"mm/dd/yyyy"`, `"dd.mm.yyyy"`, or `"dd-mm-yyyy"`) and use those cells as the candidate set for format determination. THE Parser SHALL NOT limit the candidate set to the first N cells (a `dd/mm/yyyy` statement starting on the 1st can contain ten or more rows whose day is ≤ 12).
2. WHEN all candidate date cells match `yyyy-mm-dd` unambiguously (separator is `-` and the leftmost component has exactly 4 digits), THE Parser SHALL record `DateFormat` as `"yyyy-mm-dd"` with `assumed: false`.
3. Except as specified in Criterion 10, WHEN candidate date cells use `/` as a separator and the leftmost numeric component exceeds 12 in at least one candidate cell, THE Parser SHALL record `DateFormat` as `"dd/mm/yyyy"` with `assumed: false` (a day value above 12 can only appear in the leftmost position in `dd/mm/yyyy`).
4. Except as specified in Criterion 10, WHEN candidate date cells use `/` as a separator and the middle numeric component exceeds 12 in at least one candidate cell, THE Parser SHALL record `DateFormat` as `"mm/dd/yyyy"` with `assumed: false` (a month value above 12 is impossible, so a middle component above 12 means the leftmost is the month).
5. IF the candidate set is non-empty and no component value exceeds 12 in any candidate cell (both `dd/mm/yyyy` and `mm/dd/yyyy` remain possible), THEN THE Parser SHALL default `DateFormat` to `"mm/dd/yyyy"` with `assumed: true`.
6. WHEN the `DateFormat` is determined, THE Parser SHALL apply it to every subsequent date cell in the statement without re-evaluating per row, and SHALL include a `DateFormatInfo` object `{ format, assumed }` in the `MappedResult`.
7. THE Parser SHALL output every date as an ISO `yyyy-mm-dd` string regardless of the input format.
8. IF a date cell does not conform to the resolved `DateFormat`, THEN THE Parser SHALL record a `RowError` for that row and continue parsing remaining rows. *(PBT: round-trip — for any valid calendar date and any supported `DateFormat`, formatting the date in that format, with any combination of zero-padded or non-padded day and month and, for the four non-ISO formats, either a four-digit year or a two-digit year (two-digit only for years 2000–2099), and then parsing it with that `DateFormat` SHALL return the original `yyyy-mm-dd` string.)*
9. IF the candidate set contains zero cells (no date cell in the statement matches any supported format), THEN THE Parser SHALL record a `RowError` for every date cell in the statement, leave `DateFormat` unset, and continue parsing non-date fields.
10. IF, among the `/`-separated candidate cells, at least one cell has a leftmost numeric component greater than 12 AND at least one other cell has a middle numeric component greater than 12, THEN THE Parser SHALL return a `ParseResult` with `status: "error"` and a `reason` indicating conflicting date formats; `parseStatement` SHALL NOT throw. This criterion applies only when the `/`-separated shape is the winning shape under Criterion 12; when another shape wins, contradicting `/`-separated cells are not used to determine the format and each produces a `RowError` under Criterion 8.
11. WHEN candidate date cells use `.` as a separator, THE Parser SHALL record `DateFormat` as `"dd.mm.yyyy"` with `assumed: false`. WHEN candidate date cells use `-` as a separator and the leftmost component has 1 or 2 digits, THE Parser SHALL record `DateFormat` as `"dd-mm-yyyy"` with `assumed: false`. In every supported format THE Parser SHALL accept day and month with or without zero padding (e.g. `"1/5/2026"`), and in the four non-ISO formats SHALL accept a two-digit year `yy` and read it as `20yy` (e.g. `"01.05.26"` → `"2026-05-01"`).
12. WHEN the candidate set contains cells of more than one shape (ISO `yyyy-mm-dd`; `/`-separated; `.`-separated; `-`-separated with a 1- or 2-digit leftmost component), THE Parser SHALL determine `DateFormat` using only the cells of the most frequent shape, breaking ties in the order ISO, `/`, `.`, `-`. Date cells of any other shape SHALL NOT conform to the resolved `DateFormat` and SHALL produce a `RowError` under Criterion 8.

---

### Requirement 4: Determine the decimal separator once per statement

**User Story:** As the Zombills system, I want the decimal separator to be decided from the statement as a whole, not row by row, so that amounts like "1,234.56" and "9,99" are each parsed correctly within their respective statement formats.

#### Acceptance Criteria

1. WHEN amount parsing begins, THE Parser SHALL inspect ALL non-empty amount cells in the statement and determine whether the `DecimalSeparator` is `"."` or `","`; THE Parser SHALL NOT limit inspection to the first N cells.
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

1. WHEN the layout is `SignedAmountLayout` and no `options.signConvention` is provided, THE Parser SHALL inspect the non-zero amount cells across the statement and record the `SignConvention` as `"positive-out"` if the majority of non-zero raw values are positive, or `"negative-out"` if the majority are negative, with `assumed: false` in either case. IF the counts of positive and negative non-zero raw values are equal (including when both are zero), THEN THE Parser SHALL record the `SignConvention` as `"positive-out"` with `assumed: true`.
2. WHEN `options.signConvention` is provided, THE Parser SHALL use it as the `SignConvention` with `assumed: false` and SHALL NOT perform majority inspection.
3. WHEN the `SignConvention` is `"positive-out"` and the parsed raw `amountCents` for a row is positive, THE Parser SHALL store `Transaction.amountCents` as a positive value (money out).
4. WHEN the `SignConvention` is `"positive-out"` and the parsed raw `amountCents` for a row is negative, THE Parser SHALL store `Transaction.amountCents` as a negative value (money in).
5. WHEN the `SignConvention` is `"negative-out"` and the parsed raw `amountCents` for a row is negative, THE Parser SHALL store `Transaction.amountCents` as a positive value (money out, negated to positive).
6. WHEN the `SignConvention` is `"negative-out"` and the parsed raw `amountCents` for a row is positive, THE Parser SHALL store `Transaction.amountCents` as a negative value (money in, negated to negative).
7. WHEN the layout is `SignedAmountLayout` and `amountCents` is zero, THE Parser SHALL include the row as a valid `Transaction` with `amountCents = 0` regardless of `SignConvention`.
8. THE Parser SHALL include the resolved `SignConventionInfo` object `{ convention, assumed }` in the `MappedResult` so the UI can display it, flag an assumed convention, and offer the user an override.
9. IF the layout is `SignedAmountLayout` and an amount cell value cannot be parsed as an integer number of cents (e.g. is empty, non-numeric, or would exceed the magnitude limit), THEN THE Parser SHALL record a `RowError` and SHALL NOT produce a `Transaction` for that row.
10. WHEN the layout is `SignedAmountLayout` and an amount cell contains more than 2 literal decimal places, THE Parser SHALL record a `RowError` and SHALL NOT produce a `Transaction` for that row.

---

### Requirement 7: Handle the DebitCreditLayout

**User Story:** As a user whose bank exports separate "Debit" and "Credit" columns, I want the Parser to combine them into a single signed amount, so that all transactions share the same `amountCents` representation where positive means money out and negative means money in.

#### Acceptance Criteria

1. WHEN the layout is `DebitCreditLayout` and the debit cell is populated (Criterion 6) and the credit cell is not populated, THE Parser SHALL parse the numeric value from the debit cell and store its absolute value as a **positive** `amountCents` integer (money out); `"50.00"` and `"-50.00"` SHALL both become `5000`.
2. WHEN the layout is `DebitCreditLayout` and the credit cell is populated (Criterion 6) and the debit cell is not populated, THE Parser SHALL parse the numeric value from the credit cell, and the stored `amountCents` SHALL be the negative of the absolute value of the parsed credit amount (money in); `"50.00"` and `"-50.00"` SHALL both become `-5000`.
3. WHEN the layout is `DebitCreditLayout` and both the debit cell and the credit cell are populated (Criterion 6), THE Parser SHALL record a `RowError` identifying the row index and skip that row without producing a `Transaction`.
4. WHEN the layout is `DebitCreditLayout` and neither the debit cell nor the credit cell is populated (Criterion 6), THEN: IF at least one of the two cells contains a literal zero (a value that parses to zero, e.g. `"0.00"`), THE Parser SHALL produce a valid `Transaction` with `amountCents = 0`; otherwise (both cells are empty or contain only whitespace), THE Parser SHALL record a `RowError` identifying the row index and skip that row without producing a `Transaction`.
5. IF the layout is `DebitCreditLayout` and a populated cell designated for parsing contains a value that cannot be converted to a finite numeric amount, THEN THE Parser SHALL record a `RowError` identifying the row index and skip that row without producing a `Transaction`.
6. For the purposes of Criteria 1–5, a debit or credit cell is **populated** when it contains at least one non-whitespace character and its value does not parse to zero. A cell whose value parses to zero (e.g. `"0.00"`) SHALL be treated as empty when deciding which of debit or credit is populated. A cell with non-whitespace content that cannot be parsed as an amount SHALL count as populated, so that Criterion 5 applies to it.

---

### Requirement 8: Collect row errors without aborting the parse

**User Story:** As the Zombills web UI, I want to receive both the valid transactions and a list of rows that failed to parse, so that I can show the user what was imported and flag anything suspicious without discarding good data.

#### Acceptance Criteria

1. WHEN a data row cannot be converted into a valid transaction (e.g. unparseable amount, unparseable date, or missing required cell), THE Parser SHALL append a `RowError` to the result and continue processing the next row; each `RowError` SHALL include at minimum the 1-based row number of the failing row and a description identifying which field failed and why.
2. THE Parser SHALL NOT throw an exception for a row-level error; `parseStatement` SHALL only throw if the `csv` argument is not a string (a type contract violation), and SHALL return a `ParseResult` with `status: "error"` for all other failure modes.
3. WHEN parsing is complete, THE Parser SHALL include all accumulated `RowError` objects in the returned `MappedResult.rowErrors` array.
4. WHEN no row errors occur, THE Parser SHALL return an empty `rowErrors` array.
5. WHEN every data row produces a `RowError`, THE Parser SHALL return a `ParseResult` with `status: "mapped"`, an empty `transactions` array, and a fully populated `rowErrors` array. *(PBT: for any CSV input, the count of transactions plus the count of row errors SHALL equal N, the number of data rows as defined in the Glossary: rows after the detected header row, excluding fully blank rows anywhere after the header, which are skipped and not counted.)*

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

1. IF `options.currency` is provided and is a valid ISO 4217 alpha-3 code (exactly 3 ASCII letters, matched case-insensitively), THEN THE Parser SHALL normalise it to upper case (e.g. `"usd"` → `"USD"`) and set `Transaction.currency` to the normalised value for every row that does not have a per-row currency column value.
2. IF `options.currency` is not provided, THEN THE Parser SHALL set `Transaction.currency` to the statement currency decided under Criteria 8 and 9 for every row that does not have a per-row currency column value; the statement currency is `"USD"` when nothing else applies.
3. IF `options.currency` is provided but is not a valid ISO 4217 alpha-3 code (it is not exactly 3 ASCII letters in any combination of case), THEN THE Parser SHALL return a `ParseResult` with `status: "error"` and a `reason` indicating the invalid currency code; `parseStatement` SHALL NOT throw and SHALL NOT process any rows.
4. IF a CSV column named `"currency"` or `"ccy"` (case-insensitive) is present and a row's currency cell, after trimming surrounding whitespace, contains a valid ISO 4217 alpha-3 code (exactly 3 ASCII letters, matched case-insensitively), THEN THE Parser SHALL set `Transaction.currency` to that cell's value normalised to upper case (e.g. `"eur"` → `"EUR"`) for that row, overriding `options.currency`.
5. IF a CSV column named `"currency"` or `"ccy"` (case-insensitive) is present and a row's currency cell is empty, THEN THE Parser SHALL set `Transaction.currency` to the statement currency (the normalised `options.currency` if provided, otherwise as decided under Criterion 8), and SHALL NOT produce a `RowError` for that row.
6. IF a CSV column named `"currency"` or `"ccy"` (case-insensitive) is present and a row's currency cell is non-empty but not a valid ISO 4217 alpha-3 code (it is not exactly 3 ASCII letters in any combination of case after trimming), THEN THE Parser SHALL produce a `RowError` for that row indicating the invalid currency value and SHALL NOT set `Transaction.currency` for that row.
7. THE Parser SHALL decide one statement currency per statement and SHALL include it in every `MappedResult` as `detectedCurrency: { code, source }`, where `code` is an upper-case alpha-3 code and `source` is `"option"`, `"column"`, `"symbol"` or `"default"` according to Criteria 8 and 9.
8. WHEN `options.currency` is provided, THE Parser SHALL use its normalised value as the statement currency with `source: "option"`. WHEN `options.currency` is not provided and the statement has a currency column (a column named `"currency"` or `"ccy"`, or mapped as `currency`), THE Parser SHALL NOT infer a currency from amount symbols; it SHALL use as the statement currency the one code held, after trimming and upper-casing, by every non-empty valid currency cell of all data rows, or `"USD"` when there is no such cell or the cells hold two or more different codes, with `source: "column"` in both cases.
9. WHEN `options.currency` is not provided and the statement has no currency column, THE Parser SHALL infer the statement currency from the currency symbols (Unicode general category Sc) in the amount cells of all data rows, where the amount cells are the amount column, or the debit and credit columns, and only cells shaped like an amount under Requirement 5 count. IF at least one symbol is found and every symbol found is the same, and that symbol is the pound sign (U+00A3), THEN the statement currency SHALL be `"GBP"`; IF it is the euro sign (U+20AC), THEN `"EUR"`; both with `source: "symbol"`. OTHERWISE (no symbol found, the dollar sign, any other symbol, or two or more different symbols) the statement currency SHALL be `"USD"` with `source: "default"`. Amount cells without a symbol SHALL NOT count against the rule.
10. THE Parser SHALL NOT let a currency inferred under Criterion 9, or the default under Criterion 8, change a currency set by an explicit `options.currency` (Criterion 1) or by a valid per-row currency cell (Criterion 4); symbols decide the statement currency only under the conditions of Criterion 9.

---

### Requirement 11: Header row detection

**User Story:** As a user whose bank export includes account-info lines above the actual column headers, I want the Parser to find the real header row automatically, so that those metadata lines are ignored rather than treated as bad data.

#### Acceptance Criteria

1. WHEN the Parser begins processing a CSV, THE Parser SHALL scan the first up to 20 non-empty rows searching for the first row that contains at least one cell that, after trimming leading and trailing whitespace, case-insensitively matches any known header name from the date, description, amount, debit, or credit recognition lists defined in Requirement 2.
2. WHEN a matching row is found within the first 20 non-empty rows, THE Parser SHALL treat that row as the header row and SHALL treat all rows above it as preamble; preamble rows SHALL be ignored and SHALL NOT be counted as data rows.
3. WHEN no matching row is found within the first 20 non-empty rows and `options.columnMap` is not provided, THE Parser SHALL return a `ParseResult` with `status: "mapping-required"` with a `columns` array containing the cells of the first non-empty row, so the user can manually identify which row is the header. WHEN no matching row is found and `options.columnMap` is provided, THE Parser SHALL treat the first non-empty row as the header row and validate the `ColumnMap` against its cells as specified in Requirement 9.
4. THE Parser SHALL NOT count preamble rows in the data-row total (N, as defined in the Glossary under "Data row") used by the row-count invariant in Requirement 13.

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

1. *(PBT: row-count invariant)* FOR ALL CSV strings that `parseStatement` accepts without returning `status: "error"` — where N is the number of data rows as defined in the Glossary (rows after the detected header row, excluding fully blank rows anywhere after the header, which are skipped and not counted) — `transactions.length + rowErrors.length` SHALL equal N.
2. *(PBT: amount parser never crashes)* FOR ALL arbitrary strings passed to the internal `parseAmountCents` function, the function SHALL either return a finite integer or throw a `ParseError`; it SHALL NOT return `NaN`, `Infinity`, or a non-integer, and SHALL NOT throw any other error type.
3. *(PBT: US amount round-trip)* FOR ALL integer cent values in the range −999_999_9900 to 999_999_9900, formatting the value as `(cents / 100).toFixed(2)` and then parsing with `DecimalSeparator = "."` SHALL return the original cent value.
4. *(PBT: European amount round-trip)* FOR ALL integer cent values in the range −999_999_9900 to 999_999_9900, formatting the value European-style (e.g. `"1.234,56"` or `"9,99"`) and then parsing with `DecimalSeparator = ","` SHALL return the original cent value.
5. *(PBT: date round-trip)* FOR ALL valid calendar dates and ALL supported `DateFormat` values (`"yyyy-mm-dd"`, `"dd/mm/yyyy"`, `"mm/dd/yyyy"`, `"dd.mm.yyyy"`, `"dd-mm-yyyy"`), formatting the date in that format — with any combination of zero-padded or non-padded day and month, and, for the four non-ISO formats, either a four-digit year or a two-digit year (two-digit only for years 2000–2099) — and then calling the parser's date-parse function with that string and that `DateFormat` SHALL return the original `yyyy-mm-dd` string.
6. *(PBT: amountCents sign invariant)* FOR ALL `Transaction` objects in any `MappedResult`, `Transaction.amountCents` SHALL be a whole integer; debits SHALL be positive and credits SHALL be negative; `Number.isInteger(transaction.amountCents)` SHALL be `true`.
7. *(PBT: parser is deterministic)* FOR ALL CSV strings and `ParseOptions` values, calling `parseStatement` twice with identical arguments SHALL return results that are deeply equal — matching transaction count, identical field values in identical order, and an identical error list.
8. *(PBT: sign convention consistency)* FOR ALL `SignedAmountLayout` statements where the sign convention is auto-detected, every non-zero `Transaction.amountCents` in the result SHALL have a sign consistent with the returned `detectedSignConvention.convention`.
9. *(PBT: currency precedence)* FOR ALL statements, whatever currency symbols their amount cells hold: (a) WHEN `options.currency` is provided, `detectedCurrency` SHALL be `{ code: <normalised option>, source: "option" }` and every `Transaction` without a valid currency cell of its own SHALL have that currency; (b) every `Transaction` whose currency cell holds a valid code SHALL have that code in upper case; (c) WHEN neither an option nor a currency column is present, `detectedCurrency` SHALL equal the result of the symbol rule in Requirement 10.9 applied to the symbols in the statement's amount cells.
