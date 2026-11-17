import type { Cadence, UsageAnswer } from "@zombills/core";
import { yearlySavingFor, type AnswerRecord, type Graveyard } from "./graveyard";

export const STORE_VERSION = 1;
export const MAX_STORED_RECORDS = 1_000;
/** Encode only (Req 2.2). */
export const MAX_ENCODED_TEXT_UNITS = 4_096;
/** Decode (Req 2.3): the vertical-slice 1 MiB file limit. */
export const MAX_DECODED_TEXT_UNITS = 1_048_576;
/** The parser limit (subscription-detector Req 6.5). */
export const MAX_STORED_AMOUNT_CENTS = 999_999_9900;
export const STORED_ID_PATTERN =
  /^sub:([A-Z]{3}):(weekly|monthly|yearly):(\*|\d+(?:-\d+)?):(.+)$/s;

export interface StoredRecord {
  id: string;
  merchant: string;
  serviceId: string | null;
  currentAmountCents: number;
  answer: UsageAnswer;
  cadenceAssumed: boolean;
  carriedOver: boolean;
}

export interface StoredGraveyard {
  version: 1;
  records: StoredRecord[];
}

export interface Triple {
  currency: string;
  cadence: Cadence;
  merchantKey: string;
}

export type ReadResult =
  | { kind: "empty" }
  | { kind: "ok"; graveyard: Graveyard; dropped: number }
  | { kind: "newer" }
  | { kind: "unreadable" };

/** Currency, cadence, discriminator and merchantKey of a detector id, or null. */
export function parseSubscriptionId(id: string): (Triple & { discriminator: string }) | null {
  const match = STORED_ID_PATTERN.exec(id);
  if (match === null) return null;
  const [, currency, cadence, discriminator, merchantKey] = match;
  if (
    currency === undefined ||
    cadence === undefined ||
    discriminator === undefined ||
    merchantKey === undefined
  ) {
    return null;
  }
  // The pattern admits only the three Cadence values, so the cast is safe.
  return { currency, cadence: cadence as Cadence, merchantKey, discriminator };
}

function isAnswer(value: unknown): value is UsageAnswer {
  return value === "still-using" || value === "not-using";
}

const STORED_FIELDS = [
  "id",
  "merchant",
  "serviceId",
  "currentAmountCents",
  "answer",
  "cadenceAssumed",
  "carriedOver",
] as const;

/** Req 2.3 and 2.4: the Answer record of a Valid stored record, or null. Never throws. */
export function parseStoredRecord(value: unknown): AnswerRecord | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    for (const field of STORED_FIELDS) if (!Object.hasOwn(value, field)) return null;
    // `value` is a plain object with the seven own fields (checked above); each is validated below.
    const source = value as Readonly<Record<(typeof STORED_FIELDS)[number], unknown>>;
    const { id, merchant, serviceId, currentAmountCents, answer, cadenceAssumed, carriedOver } =
      source;

    if (typeof id !== "string" || id.length > MAX_DECODED_TEXT_UNITS) return null;
    const parsed = parseSubscriptionId(id);
    if (parsed === null) return null;

    if (
      typeof currentAmountCents !== "number" ||
      !Number.isSafeInteger(currentAmountCents) ||
      currentAmountCents < 1 ||
      currentAmountCents > MAX_STORED_AMOUNT_CENTS
    ) {
      return null;
    }
    if (parsed.discriminator !== "*") {
      const amountPart = parsed.discriminator.split("-")[0];
      if (amountPart !== String(currentAmountCents)) return null;
    }

    if (
      typeof merchant !== "string" ||
      merchant.length < 1 ||
      merchant.length > MAX_DECODED_TEXT_UNITS
    ) {
      return null;
    }
    if (serviceId !== null && (typeof serviceId !== "string" || serviceId.length === 0)) {
      return null;
    }
    if (!isAnswer(answer)) return null;
    if (typeof cadenceAssumed !== "boolean" || typeof carriedOver !== "boolean") return null;

    return {
      id,
      merchant,
      serviceId,
      currency: parsed.currency,
      cadence: parsed.cadence,
      currentAmountCents,
      answer,
      cadenceAssumed,
      carriedOver,
      yearlySavingCents: yearlySavingFor({
        cadence: parsed.cadence,
        currentAmountCents,
        cadenceAssumed,
      }),
    };
  } catch {
    return null;
  }
}

/** The seven stored fields of a record (Req 2.1). */
export function toStoredRecord(record: AnswerRecord): StoredRecord {
  return {
    id: record.id,
    merchant: record.merchant,
    serviceId: record.serviceId,
    currentAmountCents: record.currentAmountCents,
    answer: record.answer,
    cadenceAssumed: record.cadenceAssumed,
    carriedOver: record.carriedOver,
  };
}

const RECORD_KEYS = [
  "id",
  "merchant",
  "serviceId",
  "currency",
  "cadence",
  "currentAmountCents",
  "answer",
  "cadenceAssumed",
  "carriedOver",
  "yearlySavingCents",
] as const;

function sameRecord(a: AnswerRecord, b: AnswerRecord): boolean {
  return RECORD_KEYS.every((key) => Object.is(a[key], b[key]));
}

/** Req 2.1, 2.2: Store text plus the number of records left out. Never throws. */
export function encodeGraveyard(graveyard: Graveyard): { text: string; leftOut: number } {
  const kept: StoredRecord[] = [];
  const seen = new Set<string>();
  let leftOut = 0;
  try {
    for (const record of graveyard) {
      try {
        const stored = toStoredRecord(record);
        const keep =
          !seen.has(stored.id) &&
          kept.length < MAX_STORED_RECORDS &&
          stored.id.length <= MAX_ENCODED_TEXT_UNITS &&
          stored.merchant.length <= MAX_ENCODED_TEXT_UNITS &&
          sameRecordOrNull(parseStoredRecord(stored), record);
        if (keep) {
          seen.add(stored.id);
          kept.push(stored);
        } else {
          leftOut += 1;
        }
      } catch {
        leftOut += 1;
      }
    }
    const stored: StoredGraveyard = { version: STORE_VERSION, records: kept };
    return { text: JSON.stringify(stored), leftOut };
  } catch {
    const empty: StoredGraveyard = { version: STORE_VERSION, records: [] };
    return { text: JSON.stringify(empty), leftOut: graveyard.length };
  }
}

function sameRecordOrNull(parsed: AnswerRecord | null, record: AnswerRecord): boolean {
  return parsed !== null && sameRecord(parsed, record);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Req 4.2–4.4, 4.6, 4.9, 4.10. Never throws, for any string or null. */
export function decodeStore(text: string | null): ReadResult {
  if (text === null) return { kind: "empty" };
  try {
    // No reviver: nothing from the text runs (Req 4.6). JSON.parse makes `__proto__` an own key.
    const root: unknown = JSON.parse(text);
    if (!isPlainObject(root)) return { kind: "unreadable" };
    const version = Object.hasOwn(root, "version") ? root["version"] : undefined;
    if (typeof version === "number" && Number.isFinite(version) && version > 1) {
      return { kind: "newer" };
    }
    const records = Object.hasOwn(root, "records") ? root["records"] : undefined;
    if (version !== 1 || !Array.isArray(records)) return { kind: "unreadable" };

    const kept: AnswerRecord[] = [];
    const seen = new Set<string>();
    for (const element of records as readonly unknown[]) {
      if (kept.length >= MAX_STORED_RECORDS) break;
      const record = parseStoredRecord(element);
      if (record === null || seen.has(record.id)) continue;
      seen.add(record.id);
      kept.push(record);
    }
    return { kind: "ok", graveyard: kept, dropped: records.length - kept.length };
  } catch {
    return { kind: "unreadable" };
  }
}
