// Req 4.3–4.5: checks that need no read. Pure: no React, DOM or clock.
import type { PageError } from "./messages";

/** 1 MiB (Req glossary "Size limit"). */
export const SIZE_LIMIT_BYTES = 1_048_576;

/** The parts of a `File` the checks read, so tests can pass plain objects. */
export interface FileFacts {
  name: string;
  type: string;
  size: number;
}

export type FileCheck<F extends FileFacts = File> =
  | { ok: true; file: F }
  | {
      ok: false;
      error: Extract<
        PageError,
        { kind: "too-many-files" | "too-large" | "not-csv" | "empty-file" }
      >;
    }
  /** An empty list: no action, the caller does nothing. */
  | { ok: false; error: null };

/** The name ends in .csv (any case) or the MIME type is text/csv. */
export function looksLikeCsv(file: FileFacts): boolean {
  return /\.csv$/i.test(file.name) || file.type.toLowerCase() === "text/csv";
}

/** Req 4.3–4.5, checked in this order: count, size, name/type, zero bytes. */
export function checkFiles<F extends FileFacts>(files: readonly F[]): FileCheck<F> {
  const [file, ...rest] = files;
  if (file === undefined) return { ok: false, error: null };
  if (rest.length > 0) return { ok: false, error: { kind: "too-many-files" } };
  if (file.size > SIZE_LIMIT_BYTES) return { ok: false, error: { kind: "too-large" } };
  if (!looksLikeCsv(file)) return { ok: false, error: { kind: "not-csv" } };
  if (file.size === 0) return { ok: false, error: { kind: "empty-file" } };
  return { ok: true, file };
}

/** Req 4.5: the decoded text contains U+0000. */
export function containsNul(text: string): boolean {
  return text.includes("\u0000");
}
