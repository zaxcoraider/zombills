import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STORE_MODULE = "apps/web/src/slice/storage/graveyard-store.ts";
const RESTRICTED = new Set(["no-restricted-globals", "no-restricted-properties"]);

async function restrictedErrors(code: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const [result] = await eslint.lintText(code, { filePath: join(REPO_ROOT, filePath) });
  return (result?.messages ?? []).flatMap((m) =>
    m.ruleId && RESTRICTED.has(m.ruleId) ? [m.ruleId] : [],
  );
}

describe("storage lint rule (Req 10.3)", () => {
  it("rejects bare localStorage outside the Store module", async () => {
    expect(
      await restrictedErrors('localStorage.getItem("k");', "apps/web/src/slice/slice-page.tsx"),
    ).toEqual(["no-restricted-globals"]);
  });

  it("rejects window.sessionStorage outside the Store module", async () => {
    expect(
      await restrictedErrors(
        "void window.sessionStorage.length;",
        "apps/web/src/slice/slice-page.tsx",
      ),
    ).toEqual(["no-restricted-properties"]);
  });

  it("rejects document.cookie outside the Store module", async () => {
    expect(
      await restrictedErrors('document.cookie = "a=b";', "apps/web/src/slice/slice-page.tsx"),
    ).toEqual(["no-restricted-properties"]);
  });

  it("rejects window.localStorage in use-graveyard-memory.ts", async () => {
    expect(
      await restrictedErrors(
        'window.localStorage.getItem("k");',
        "apps/web/src/slice/storage/use-graveyard-memory.ts",
      ),
    ).toHaveLength(1);
  });

  it("allows localStorage and window.localStorage in the Store module", async () => {
    expect(
      await restrictedErrors(
        'window.localStorage.getItem("k"); void localStorage.length;',
        STORE_MODULE,
      ),
    ).toHaveLength(0);
  });

  it("still rejects globalThis.localStorage, sessionStorage and fetch in the Store module", async () => {
    expect(
      await restrictedErrors(
        'void globalThis.localStorage; void sessionStorage; void fetch("x");',
        STORE_MODULE,
      ),
    ).toHaveLength(3);
  });

  it("rejects window.localStorage in slice/logic", async () => {
    expect(
      (
        await restrictedErrors(
          "void window.localStorage;",
          "apps/web/src/slice/logic/graveyard-codec.ts",
        )
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
