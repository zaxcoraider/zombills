// Req 10.1, 10.2, 10.5 and privacy.md: the normalizer never reaches for the network or the browser.
//
// The scan is the same syntax-tree scan the parser uses (src/test-no-network-scan.ts).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN, findForbiddenReferences, sourceFilesUnder } from "../test-no-network-scan.js";

const normalizeRoot = fileURLToPath(new URL("./", import.meta.url));

describe("no network and no browser APIs in the normalizer (Req 10.1, 10.2, 10.5)", () => {
  it("finds no network or browser reference in any non-test source file", () => {
    const files = sourceFilesUnder(normalizeRoot);
    // A scan that reads nothing would pass for the wrong reason.
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(files.some((file) => file.endsWith("normalize-merchant.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("known-services.ts"))).toBe(true);
    expect(files.some((file) => /\.test\.ts$/.test(file) || file.includes("test-"))).toBe(false);

    const violations = files.flatMap((file) =>
      findForbiddenReferences(readFileSync(file, "utf8"), file.slice(normalizeRoot.length)),
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

  it("does not report a comment or a longer identifier such as prefetchAll", () => {
    const source = [
      "// never call fetch or localStorage here",
      "/* window and document are off limits */",
      "const prefetchAll = 1;",
      "const localStorageKey = 2;",
    ].join("\n");
    expect(findForbiddenReferences(source, "f.ts")).toEqual([]);
  });
});
