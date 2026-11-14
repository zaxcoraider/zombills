import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const PRIVACY_MESSAGE = "Statement data never leaves the browser (privacy.md).";

// Network and DOM identifiers that must never appear in packages/core (privacy.md, Req 12).
const RESTRICTED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "document",
  "window",
  "navigator",
  "localStorage",
].map((name) => ({ name, message: PRIVACY_MESSAGE }));

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", ...RESTRICTED_GLOBALS],
      "no-restricted-properties": [
        "error",
        { object: "navigator", property: "sendBeacon", message: PRIVACY_MESSAGE },
        { object: "globalThis", property: "fetch", message: PRIVACY_MESSAGE },
        { object: "window", property: "fetch", message: PRIVACY_MESSAGE },
      ],
      // Blocks every use of globalThis, so the rules above cannot be bypassed via
      // globalThis.fetch, globalThis["fetch"] or (globalThis as T).fetch.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Identifier[name='globalThis']",
          message: `globalThis is not allowed in packages/core. ${PRIVACY_MESSAGE}`,
        },
      ],
      "no-console": "error",
    },
  },
  eslintConfigPrettier,
);
