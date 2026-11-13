import Papa from "papaparse";
import type { Delimiter, ParsedTable } from "./internal-types";

const BYTE_ORDER_MARK = "\uFEFF";

const DELIMITERS_TO_GUESS: Delimiter[] = [",", ";", "\t"];

function isDelimiter(value: string): value is Delimiter {
  return value === "," || value === ";" || value === "\t";
}

/** Removes one leading UTF-8 byte order mark (U+FEFF), if present. */
export function stripBom(csv: string): string {
  return csv.startsWith(BYTE_ORDER_MARK) ? csv.slice(1) : csv;
}

/**
 * Splits CSV text into rows and cells with Papa Parse. All cells stay strings and blank rows are
 * kept, so the caller applies its own blank-row rule. The delimiter is guessed among comma,
 * semicolon and tab; Papa Parse falls back to comma when it cannot decide.
 *
 * Papa Parse problems (for example unbalanced quotes) are not fatal here. They surface later as
 * row errors on the affected rows.
 */
export function tokenize(csv: string): ParsedTable {
  // No worker and no download: Papa Parse runs synchronously on the string, so none of its
  // network, file or Web Worker code paths are reachable.
  const result = Papa.parse<string[]>(csv, {
    delimiter: "",
    delimitersToGuess: DELIMITERS_TO_GUESS,
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    worker: false,
    download: false,
  });
  const guessed = result.meta.delimiter;
  return {
    rows: result.data,
    delimiter: isDelimiter(guessed) ? guessed : ",",
  };
}

/** A row is blank when every cell is empty or contains only whitespace. */
export function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

/** Re-serialises a row with the given delimiter, quoting cells where needed. Used for `RowError.rawRow`. */
export function serializeRow(cells: readonly string[], delimiter: Delimiter): string {
  return Papa.unparse([cells], { delimiter });
}
