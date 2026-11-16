import type { CancellationEmail, EmailInput } from "./types.js";

/** Oracle for P1 to P3, written from the requirement text. It shares no code with src/cancel. */

const MAX_CODE_POINTS = 80;

/** for…of yields a lone surrogate as its own code point. */
export function referenceWellFormed(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    out += cp >= 0xd800 && cp <= 0xdfff ? "\uFFFD" : ch;
  }
  return out;
}

function isSeparator(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    /\p{Cf}/u.test(ch) ||
    /\p{Cc}/u.test(ch) ||
    /\p{Zs}/u.test(ch) ||
    (cp >= 0x09 && cp <= 0x0d) ||
    cp === 0x85 ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    cp === 0xfeff
  );
}

/** One walk by code point: repair, fold separator runs, trim, cut at 80 with a counter. */
export function referenceClean(s: string): string {
  let out = "";
  let count = 0;
  let pendingSpace = false;
  for (const raw of s) {
    const cp = raw.codePointAt(0) ?? 0;
    const ch = cp >= 0xd800 && cp <= 0xdfff ? "\uFFFD" : raw;
    if (isSeparator(ch)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && count > 0) {
      if (count >= MAX_CODE_POINTS) break;
      out += " ";
      count += 1;
    }
    pendingSpace = false;
    if (count >= MAX_CODE_POINTS) break;
    out += ch;
    count += 1;
  }
  // A space can be the 80th code point; the cut is trimmed again.
  return out.endsWith(" ") ? out.slice(0, -1) : out;
}

function isCurrencyCode(c: unknown): c is string {
  if (typeof c !== "string" || c.length !== 3) return false;
  for (const ch of c) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x41 || cp > 0x5a) return false;
  }
  return true;
}

/** The expected subject and body, built from the written-out pieces of Req 3.3 and 3.4. */
export function referenceEmail(input: EmailInput): CancellationEmail {
  const N = referenceClean(input.serviceName);
  const A = referenceClean(input.amountText);
  const currencyPart = isCurrencyCode(input.currency) ? " (" + input.currency + ")" : "";

  const subject =
    N === "" ? "Please cancel my subscription" : "Please cancel my " + N + " subscription";
  const request =
    N === ""
      ? "Please cancel my subscription and stop all future payments."
      : "Please cancel my " + N + " subscription and stop all future payments.";

  let every: string | null = null;
  if (input.cadenceAssumed === false) {
    if (input.cadence === "weekly") every = "week";
    if (input.cadence === "monthly") every = "month";
    if (input.cadence === "yearly") every = "year";
  }

  let amountBlock = "";
  if (A !== "") {
    amountBlock =
      every === null
        ? "My most recent charge was " + A + currencyPart + ".\n\n"
        : "I am currently charged " + A + currencyPart + " every " + every + ".\n\n";
  }

  const body =
    "Hello,\n\n" +
    request +
    "\n\n" +
    "Name on the account: [Your name]\n" +
    "Account email: [Your account email]\n\n" +
    amountBlock +
    "Please confirm in writing that the subscription is cancelled, the date it ends, and that no further payments will be taken.\n\n" +
    "Thank you,\n" +
    "[Your name]";
  return { subject, body };
}
