// Req 12.1, 12.2, 12.4 and privacy.md: the parser never reaches for the network or the browser.
//
// The scan reads the syntax tree of every non-test source file, so a mention in a comment is never
// a reference, and a string or a regular expression cannot be mistaken for a comment. The scanner
// is shared with src/normalize/no-network.test.ts and lives in src/test-no-network-scan.ts.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN, findForbiddenReferences, sourceFilesUnder } from "../test-no-network-scan.js";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const repoRoot = join(packageRoot, "..", "..");

describe("no network and no browser APIs in the parser (Req 12.1, 12.2, 12.4)", () => {
  it("finds no network or browser reference in any non-test source file", () => {
    const files = sourceFilesUnder(sourceRoot);
    // A scan that reads nothing would pass for the wrong reason.
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(files.some((file) => file.endsWith("parse-statement.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("tokenize.ts"))).toBe(true);
    expect(
      files.some((file) => /\.test\.ts$/.test(file) || file.includes("test-arbitraries")),
    ).toBe(false);

    const violations = files.flatMap((file) =>
      findForbiddenReferences(readFileSync(file, "utf8"), file.slice(sourceRoot.length)),
    );
    expect(
      violations.map((v) => `${v.file}:${v.line} ${v.identifier}`),
      "network or browser API referenced",
    ).toEqual([]);
  });
});

describe("the scanner itself", () => {
  it("reports fetch( with the file, the line and the identifier", () => {
    const violations = findForbiddenReferences(
      'const a = 1;\nawait fetch("https://example.com");\n',
      "fixture.ts",
    );
    expect(violations).toEqual([{ file: "fixture.ts", line: 2, identifier: "fetch" }]);
  });

  it.each(FORBIDDEN.map((word) => [word] as const))("reports %s", (word) => {
    expect(findForbiddenReferences(`const x = ${word};`, "f.ts").map((v) => v.identifier)).toEqual([
      word,
    ]);
  });

  it("reports member accesses, constructors and strings that name the API", () => {
    const source = [
      'navigator.sendBeacon("/x", data);',
      "const request = new XMLHttpRequest();",
      'const socket = new WebSocket("wss://example.com");',
      "const title = window.document.title;",
      'const name = "fetch";',
      "const pattern = /window/;",
      "const text = `call navigator now`;",
    ].join("\n");
    const found = findForbiddenReferences(source, "f.ts").map((v) => `${v.line}:${v.identifier}`);
    expect(found).toEqual([
      "1:navigator",
      "1:sendBeacon",
      "2:XMLHttpRequest",
      "3:WebSocket",
      "4:window",
      "4:document",
      "5:fetch",
      "6:window",
      "7:navigator",
    ]);
  });

  it("does not report mentions in comments", () => {
    const source = [
      "// never call fetch here",
      "/* window, document and navigator are off limits */",
      "/** @see XMLHttpRequest */",
      "const fine = 1;",
    ].join("\n");
    expect(findForbiddenReferences(source, "f.ts")).toEqual([]);
  });

  it("matches whole words only", () => {
    const source =
      "const prefetchAll = 1; const documentation = 2; const windowed = 3; const fetch_all = 4;";
    expect(findForbiddenReferences(source, "f.ts")).toEqual([]);
  });

  it("does not treat a string that contains // as the start of a comment", () => {
    const source = 'const url = "http://example.com"; const x = fetch;';
    expect(findForbiddenReferences(source, "f.ts").map((v) => v.identifier)).toEqual(["fetch"]);
  });
});

describe("the ESLint guard on packages/core (Req 12.4, privacy.md)", () => {
  const eslint = join(repoRoot, "node_modules", ".bin", "eslint");
  const fixture = join(packageRoot, "src", "parse", "guard-fixture.ts");

  function lint(code: string): { status: number | null; output: string } {
    const run = spawnSync(eslint, ["--stdin", "--stdin-filename", fixture], {
      cwd: packageRoot,
      input: code,
      encoding: "utf8",
    });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  }

  it("fails on a snippet that calls fetch", () => {
    const run = lint('export const response = fetch("x");\n');
    expect(run.status).toBe(1);
    expect(run.output).toContain("no-restricted-globals");
    expect(run.output).toContain("fetch");
  }, 60_000);

  it("fails on each other forbidden API, on console and on globalThis", () => {
    const run = lint(
      [
        "export const a = new XMLHttpRequest();",
        'export const b = new WebSocket("wss://example.com");',
        'export const c = navigator.sendBeacon("/x");',
        "export const d = window.name;",
        "export const f = document.title;",
        'console.log("x");',
        'export const e = (globalThis as Record<string, unknown>)["fetch"];',
        "",
      ].join("\n"),
    );
    expect(run.status).toBe(1);
    for (const expected of [
      "XMLHttpRequest",
      "WebSocket",
      "navigator",
      "sendBeacon",
      "window",
      "document",
      "no-console",
      "globalThis",
    ]) {
      expect(run.output, expected).toContain(expected);
    }
  }, 60_000);

  it("accepts a snippet that uses none of them", () => {
    const run = lint("export const total = (a: number, b: number): number => a + b;\n");
    expect(run.status, run.output).toBe(0);
  }, 60_000);
});
