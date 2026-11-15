// Test-only helper (never built, see tsconfig.build.json): a syntax-tree scan for network and
// browser APIs, shared by the parser's and the normalizer's no-network tests (privacy.md).
//
// The scan reads the syntax tree of every non-test source file, so a mention in a comment is never
// a reference, and a string or a regular expression cannot be mistaken for a comment.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export const FORBIDDEN = [
  "fetch",
  "XMLHttpRequest",
  "sendBeacon",
  "WebSocket",
  "document",
  "window",
  "navigator",
  "localStorage",
] as const;

const FORBIDDEN_WORD = new RegExp(`\\b(${FORBIDDEN.join("|")})\\b`, "g");

export interface Violation {
  file: string;
  line: number;
  identifier: string;
}

/**
 * Finds every identifier, string, template or regular expression in `source` that contains one of
 * the forbidden words as a whole word. Comments are not looked at.
 */
export function findForbiddenReferences(source: string, file: string): Violation[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  const check = (node: ts.Node, text: string): void => {
    for (const match of text.matchAll(FORBIDDEN_WORD)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({ file, line: line + 1, identifier: match[1] ?? match[0] });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      check(node, node.text);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isRegularExpressionLiteral(node)
    ) {
      check(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

/** Every non-test `.ts` file under `directory`: test files and `test-*` helpers are skipped. */
export function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return sourceFilesUnder(path);
    }
    const isTestSupport = /\.test\.ts$/.test(name) || name.startsWith("test-");
    return name.endsWith(".ts") && !isTestSupport ? [path] : [];
  });
}

/**
 * The clock and randomness accesses the detector must not use (Req 12.3, 12.6), as
 * `object.property` pairs. A `new Date` with no arguments is checked separately.
 */
export const CLOCK_AND_RANDOM = [
  ["Date", "now"],
  ["performance", "now"],
  ["Math", "random"],
  ["crypto", "randomUUID"],
] as const;

/**
 * Opt-in second check, used by the detector's test only: finds the property accesses in
 * `CLOCK_AND_RANDOM` and every `new Date` expression with no arguments, on the syntax tree. A
 * comment, a string or a longer identifier such as `randomize` is never a match.
 */
export function findClockAndRandomReferences(source: string, file: string): Violation[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  const report = (node: ts.Node, identifier: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({ file, line: line + 1, identifier });
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ts.isIdentifier(node.name)
    ) {
      const object = node.expression.text;
      const property = node.name.text;
      if (CLOCK_AND_RANDOM.some(([o, p]) => o === object && p === property)) {
        report(node, `${object}.${property}`);
      }
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Date" &&
      (node.arguments === undefined || node.arguments.length === 0)
    ) {
      report(node, "new Date");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

/**
 * The same syntax-tree walk as `findForbiddenReferences`, with the word list as a parameter: finds
 * every identifier, string, template or regular expression in `source` that contains one of `words`
 * as a whole word. Comments are not looked at.
 */
export function findWordReferences(
  source: string,
  file: string,
  words: readonly string[],
): Violation[] {
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const wordPattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "g");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  const check = (node: ts.Node, text: string): void => {
    for (const match of text.matchAll(wordPattern)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({ file, line: line + 1, identifier: match[1] ?? match[0] });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      check(node, node.text);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isRegularExpressionLiteral(node)
    ) {
      check(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}
