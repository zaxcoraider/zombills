// Req 12.1, 12.2, 12.3, 12.6 and privacy.md: the detector never reaches for the network, the browser,
// the clock or randomness.
//
// Both checks come from src/test-no-network-scan.ts and read the syntax tree, so a mention in a
// comment is never a reference.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findClockAndRandomReferences,
  findForbiddenReferences,
  sourceFilesUnder,
} from "../test-no-network-scan.js";

const detectRoot = fileURLToPath(new URL("./", import.meta.url));

describe("no network, browser, clock or randomness in the detector (Req 12.1, 12.2, 12.3, 12.6)", () => {
  const files = sourceFilesUnder(detectRoot);

  it("scans the detector's source files", () => {
    // A scan that reads nothing would pass for the wrong reason.
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(files.some((file) => file.endsWith("detect-subscriptions.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("dates.ts"))).toBe(true);
    expect(files.some((file) => /\.test\.ts$/.test(file) || file.includes("test-"))).toBe(false);
  });

  it("finds no network or browser reference in any non-test source file", () => {
    const violations = files.flatMap((file) =>
      findForbiddenReferences(readFileSync(file, "utf8"), file.slice(detectRoot.length)),
    );
    expect(
      violations.map((v) => `${v.file}:${v.line} ${v.identifier}`),
      "network or browser API referenced",
    ).toEqual([]);
  });

  it("finds no clock or randomness access in any non-test source file", () => {
    const violations = files.flatMap((file) =>
      findClockAndRandomReferences(readFileSync(file, "utf8"), file.slice(detectRoot.length)),
    );
    expect(
      violations.map((v) => `${v.file}:${v.line} ${v.identifier}`),
      "clock or randomness referenced",
    ).toEqual([]);
  });
});

describe("the clock and randomness check itself", () => {
  it("reports Date.now() with the file, the line and the identifier", () => {
    expect(findClockAndRandomReferences("const a = 1;\nconst t = Date.now();\n", "f.ts")).toEqual([
      { file: "f.ts", line: 2, identifier: "Date.now" },
    ]);
  });

  it("reports new Date() with no arguments", () => {
    expect(findClockAndRandomReferences("const d = new Date();", "f.ts")).toEqual([
      { file: "f.ts", line: 1, identifier: "new Date" },
    ]);
    expect(findClockAndRandomReferences("const d = new Date;", "f.ts")).toEqual([
      { file: "f.ts", line: 1, identifier: "new Date" },
    ]);
  });

  it("reports Math.random()", () => {
    expect(findClockAndRandomReferences("const r = Math.random();", "f.ts")).toEqual([
      { file: "f.ts", line: 1, identifier: "Math.random" },
    ]);
  });

  it("reports crypto.randomUUID()", () => {
    expect(findClockAndRandomReferences("const id = crypto.randomUUID();", "f.ts")).toEqual([
      { file: "f.ts", line: 1, identifier: "crypto.randomUUID" },
    ]);
  });

  it("reports performance.now()", () => {
    expect(findClockAndRandomReferences("const t = performance.now();", "f.ts")).toEqual([
      { file: "f.ts", line: 1, identifier: "performance.now" },
    ]);
  });

  it("does not report new Date(2026, 0, 1)", () => {
    expect(findClockAndRandomReferences("const d = new Date(2026, 0, 1);", "f.ts")).toEqual([]);
  });

  it("does not report a comment that mentions Date.now", () => {
    const source = ["// never call Date.now() here", "/* nor Math.random() */", "const a = 1;"].join(
      "\n",
    );
    expect(findClockAndRandomReferences(source, "f.ts")).toEqual([]);
  });

  it("does not report an identifier such as randomize", () => {
    const source = "const randomize = 1;\nfunction nowish() { return randomize; }\nrandomize;";
    expect(findClockAndRandomReferences(source, "f.ts")).toEqual([]);
  });

  it("leaves the existing network check unchanged: it ignores the clock and randomness", () => {
    expect(findForbiddenReferences("const t = Date.now() + Math.random();", "f.ts")).toEqual([]);
  });
});
