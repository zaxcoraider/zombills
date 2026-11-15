import { describe, expect, it } from "vitest";
import {
  checkFiles,
  containsNul,
  looksLikeCsv,
  SIZE_LIMIT_BYTES,
  type FileFacts,
} from "./file-checks";

const file = (name: string, type = "", size = 10): FileFacts => ({ name, type, size });

describe("checkFiles: count", () => {
  it("does nothing for no files", () => {
    expect(checkFiles([])).toEqual({ ok: false, error: null });
  });

  it("accepts one file and returns the same object", () => {
    const one = file("a.csv");
    const result = checkFiles([one]);
    expect(result).toEqual({ ok: true, file: one });
    expect(result.ok && result.file).toBe(one);
  });

  it("rejects two files, even when both are fine", () => {
    expect(checkFiles([file("a.csv"), file("b.csv")])).toEqual({
      ok: false,
      error: { kind: "too-many-files" },
    });
  });
});

describe("checkFiles: size", () => {
  it("accepts exactly 1,048,576 bytes", () => {
    expect(SIZE_LIMIT_BYTES).toBe(1_048_576);
    expect(checkFiles([file("a.csv", "", 1_048_576)]).ok).toBe(true);
  });

  it("rejects 1,048,577 bytes", () => {
    expect(checkFiles([file("a.csv", "", 1_048_577)])).toEqual({
      ok: false,
      error: { kind: "too-large" },
    });
  });

  it("reports too-large before not-csv", () => {
    expect(checkFiles([file("a.exe", "", 1_048_577)])).toEqual({
      ok: false,
      error: { kind: "too-large" },
    });
  });
});

describe("checkFiles: name and type", () => {
  it.each(["statement.CSV", "statement.csv", "Statement.Csv"])("accepts %s", (name) => {
    expect(checkFiles([file(name)]).ok).toBe(true);
  });

  it("accepts statement.txt with type text/csv", () => {
    expect(checkFiles([file("statement.txt", "text/csv")]).ok).toBe(true);
  });

  it("rejects statement.txt with type text/plain", () => {
    expect(checkFiles([file("statement.txt", "text/plain")])).toEqual({
      ok: false,
      error: { kind: "not-csv" },
    });
  });

  it("rejects statement.csv.exe", () => {
    expect(checkFiles([file("statement.csv.exe")])).toEqual({
      ok: false,
      error: { kind: "not-csv" },
    });
  });

  it("looksLikeCsv reads only the name and the type", () => {
    expect(looksLikeCsv(file("x.csv"))).toBe(true);
    expect(looksLikeCsv(file("x", "text/csv"))).toBe(true);
    expect(looksLikeCsv(file("x", "application/csv"))).toBe(false);
  });
});

describe("checkFiles: zero bytes", () => {
  it("rejects a 0-byte CSV as empty", () => {
    expect(checkFiles([file("a.csv", "", 0)])).toEqual({
      ok: false,
      error: { kind: "empty-file" },
    });
  });

  it("rejects a 0-byte file typed text/csv as empty", () => {
    expect(checkFiles([file("a", "text/csv", 0)])).toEqual({
      ok: false,
      error: { kind: "empty-file" },
    });
  });

  it("reports not-csv for a 0-byte notes.txt (check order)", () => {
    expect(checkFiles([file("notes.txt", "", 0)])).toEqual({
      ok: false,
      error: { kind: "not-csv" },
    });
  });
});

describe("containsNul", () => {
  it("is true when U+0000 appears anywhere", () => {
    expect(containsNul("a\u0000b")).toBe(true);
    expect(containsNul("\u0000")).toBe(true);
  });

  it("is false for text without U+0000", () => {
    expect(containsNul("")).toBe(false);
    expect(containsNul("Date,Description\n01/02/2026,NETFLIX,-15.49")).toBe(false);
  });
});
