// Req 7.1, 7.2, 7.3, 7.4 and privacy.md: the classifier never reaches for the network, the
// browser, storage, the console, the clock or randomness.
//
// The checks come from src/test-no-network-scan.ts and read the syntax tree, so a mention in a
// comment is never a reference.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findClockAndRandomReferences,
  findForbiddenReferences,
  findWordReferences,
  sourceFilesUnder,
} from "../test-no-network-scan.js";

const classifyRoot = fileURLToPath(new URL("./", import.meta.url));
const EXTRA_WORDS = ["console", "sessionStorage", "indexedDB"] as const;

function describeViolations(violations: { file: string; line: number; identifier: string }[]) {
  return violations.map((v) => `${v.file}:${v.line} ${v.identifier}`);
}

describe("no network, browser, storage, console, clock or randomness in the classifier (Req 7.4)", () => {
  const files = sourceFilesUnder(classifyRoot);
  const read = (file: string) =>
    [readFileSync(file, "utf8"), file.slice(classifyRoot.length)] as const;

  it("scans the classifier's source files", () => {
    // A scan that reads nothing would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.endsWith("classify-subscriptions.ts"))).toBe(true);
    expect(files.some((file) => /\.test\.ts$/.test(file) || file.includes("test-"))).toBe(false);
  });

  it("finds no network or browser reference in any non-test source file", () => {
    const violations = files.flatMap((file) => findForbiddenReferences(...read(file)));
    expect(describeViolations(violations), "network or browser API referenced").toEqual([]);
  });

  it("finds no clock or randomness access in any non-test source file", () => {
    const violations = files.flatMap((file) => findClockAndRandomReferences(...read(file)));
    expect(describeViolations(violations), "clock or randomness referenced").toEqual([]);
  });

  it("finds no console, sessionStorage or indexedDB reference in any non-test source file", () => {
    const violations = files.flatMap((file) => {
      const [source, name] = read(file);
      return findWordReferences(source, name, EXTRA_WORDS);
    });
    expect(describeViolations(violations), "console or storage referenced").toEqual([]);
  });
});

describe("the word check itself", () => {
  it("reports console.log(x) with the file, the line and the word", () => {
    expect(findWordReferences("const a = 1;\nconsole.log(x);\n", "f.ts", EXTRA_WORDS)).toEqual([
      { file: "f.ts", line: 2, identifier: "console" },
    ]);
  });

  it("reports sessionStorage and indexedDB", () => {
    expect(findWordReferences("sessionStorage.getItem('k');", "f.ts", EXTRA_WORDS)).toEqual([
      { file: "f.ts", line: 1, identifier: "sessionStorage" },
    ]);
    expect(findWordReferences("\n\nindexedDB.open('db');", "f.ts", EXTRA_WORDS)).toEqual([
      { file: "f.ts", line: 3, identifier: "indexedDB" },
    ]);
  });

  it("does not report a comment that mentions console", () => {
    const source = [
      "// never call console.log here",
      "/* nor sessionStorage */",
      "const a = 1;",
    ].join("\n");
    expect(findWordReferences(source, "f.ts", EXTRA_WORDS)).toEqual([]);
  });

  it("does not report a longer identifier such as consoleLike", () => {
    expect(findWordReferences("const consoleLike = 1;", "f.ts", EXTRA_WORDS)).toEqual([]);
  });

  it("uses the word list it is given", () => {
    expect(findWordReferences("console.log(x);", "f.ts", ["window"])).toEqual([]);
    expect(findWordReferences("window.x;", "f.ts", ["window"])).toEqual([
      { file: "f.ts", line: 1, identifier: "window" },
    ]);
  });

  it("leaves the existing network check unchanged: it ignores console and storage", () => {
    expect(findForbiddenReferences("console.log(sessionStorage, indexedDB);", "f.ts")).toEqual([]);
  });
});
