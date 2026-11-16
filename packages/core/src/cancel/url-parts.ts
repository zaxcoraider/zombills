/** The parts of a parsed URL that the validator reads (WHATWG URL, Req 5.4). */
export interface UrlParts {
  readonly href: string;
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  readonly port: string;
  readonly hostname: string;
  readonly search: string;
}

// The core typecheck has no DOM lib and `types: []`. This module-scoped declaration names the one
// browser and Node global the validator uses, with only the fields it reads. It shadows the type
// of the global inside this file only and emits nothing; at runtime `URL` is the platform's
// WHATWG parser. No other browser global is declared (Req 5.4).
declare const URL: new (input: string) => UrlParts;

/** null when the WHATWG parser rejects text or text is not a string. */
export function parseUrl(text: unknown): UrlParts | null {
  if (typeof text !== "string") return null;
  try {
    return new URL(text);
  } catch {
    return null;
  }
}
