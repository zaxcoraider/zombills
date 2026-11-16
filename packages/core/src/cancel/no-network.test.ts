// Req 4.1, 4.3 and privacy.md: the Cancel module never reaches for the network, the browser,
// storage, the console, the clock or randomness.
//
// The checks come from src/test-no-network-scan.ts and read the syntax tree.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findClockAndRandomReferences,
  findCodeReferences,
  findForbiddenReferences,
  sourceFilesUnder,
} from "../test-no-network-scan.js";

const cancelRoot = fileURLToPath(new URL("./", import.meta.url));
const CODE_WORDS = ["console", "sessionStorage", "indexedDB"] as const;
const CODE_ACCESSES = [["document", "cookie"]] as const;

function describeViolations(violations: { file: string; line: number; identifier: string }[]) {
  return violations.map((v) => `${v.file}:${v.line} ${v.identifier}`);
}

describe("no network, browser, storage, console, clock or randomness in src/cancel (Req 4.1, 4.3)", () => {
  const files = sourceFilesUnder(cancelRoot);
  const read = (file: string) =>
    [readFileSync(file, "utf8"), file.slice(cancelRoot.length)] as const;

  it("scans the module's source files", () => {
    // A scan that reads nothing would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.endsWith("cancel-data.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("url-parts.ts"))).toBe(true);
    expect(files.some((file) => /\.test\.ts$/.test(file) || file.includes("test-"))).toBe(false);
  });

  it("finds no network or browser reference, in code or in a string, in any source file", () => {
    const violations = files.flatMap((file) => findForbiddenReferences(...read(file)));
    expect(describeViolations(violations), "network or browser API referenced").toEqual([]);
  });

  it("finds no clock or randomness access in any source file", () => {
    const violations = files.flatMap((file) => findClockAndRandomReferences(...read(file)));
    expect(describeViolations(violations), "clock or randomness referenced").toEqual([]);
  });

  it("finds no console, sessionStorage, indexedDB or document.cookie in any source file", () => {
    const violations = files.flatMap((file) => {
      const [source, name] = read(file);
      return findCodeReferences(source, name, CODE_WORDS, CODE_ACCESSES);
    });
    expect(describeViolations(violations), "console, storage or cookie referenced").toEqual([]);
  });
});

describe("the code check itself", () => {
  it("reports console.log(x) with the file, the line and the word", () => {
    expect(
      findCodeReferences("const a = 1;\nconsole.log(x);\n", "f.ts", CODE_WORDS, CODE_ACCESSES),
    ).toEqual([{ file: "f.ts", line: 2, identifier: "console" }]);
  });

  it("reports document.cookie with the file, the line and the access", () => {
    expect(
      findCodeReferences("\n\nconst c = document.cookie;\n", "f.ts", CODE_WORDS, CODE_ACCESSES),
    ).toEqual([{ file: "f.ts", line: 3, identifier: "document.cookie" }]);
  });

  it("reports sessionStorage and indexedDB", () => {
    expect(
      findCodeReferences("sessionStorage.clear();\nindexedDB.open('d');", "f.ts", CODE_WORDS, []),
    ).toEqual([
      { file: "f.ts", line: 1, identifier: "sessionStorage" },
      { file: "f.ts", line: 2, identifier: "indexedDB" },
    ]);
  });

  it("does not report a string, a template, a regular expression or a comment", () => {
    const source = [
      'const a = "On your console, open Settings.";',
      "const b = `console ${1}`;",
      "const c = /console/;",
      "// console.log and document.cookie in a comment",
      "/* sessionStorage */",
      'const d = "document.cookie";',
    ].join("\n");
    expect(findCodeReferences(source, "f.ts", CODE_WORDS, CODE_ACCESSES)).toEqual([]);
  });

  it("does not report a longer identifier or another property of document", () => {
    const source = "const consoleLike = 1;\nconst t = other.cookie;\nconst u = document.title;";
    expect(findCodeReferences(source, "f.ts", CODE_WORDS, CODE_ACCESSES)).toEqual([]);
  });
});
