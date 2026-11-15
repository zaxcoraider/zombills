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

const MONEY_MESSAGE = "Format money with formatMoney (money.md, Req 6.2).";
const PURITY_MESSAGE = "The slice logic layer is pure (Req 3.1).";

// Network identifiers that must never appear in apps/web/src (privacy.md, Req 7.4).
const WEB_NETWORK_GLOBALS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].map((name) => ({
  name,
  message: PRIVACY_MESSAGE,
}));
const WEB_NETWORK_PROPERTIES = ["navigator", "window", "globalThis", "self"].flatMap((object) =>
  ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon"].map((property) => ({
    object,
    property,
    message: PRIVACY_MESSAGE,
  })),
);

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
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", ...WEB_NETWORK_GLOBALS],
      "no-restricted-properties": ["error", ...WEB_NETWORK_PROPERTIES],
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/packages/core/**"],
              message: "Import the Pipeline from @zombills/core only (Req 9.1).",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.property.name='toFixed']", message: MONEY_MESSAGE },
        { selector: "BinaryExpression[operator='/'][right.value=100]", message: MONEY_MESSAGE },
      ],
    },
  },
  {
    // Analyzer purity (Req 3.1): no DOM, storage, clock or randomness in the pure-logic layer.
    // Flat config replaces rule options, so WEB_NETWORK_PROPERTIES is repeated here.
    files: ["apps/web/src/slice/logic/**/*.ts"],
    ignores: ["apps/web/src/slice/logic/**/*.test.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...RESTRICTED_GLOBALS,
        ...["EventSource", "sessionStorage", "indexedDB", "caches"].map((name) => ({
          name,
          message: PURITY_MESSAGE,
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...WEB_NETWORK_PROPERTIES,
        { object: "Date", property: "now", message: PURITY_MESSAGE },
        { object: "performance", property: "now", message: PURITY_MESSAGE },
        { object: "Math", property: "random", message: PURITY_MESSAGE },
      ],
    },
  },
  {
    // The one place that converts minor units for display (Req 6.2).
    files: ["apps/web/src/slice/logic/money.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  eslintConfigPrettier,
);
