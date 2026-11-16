import { getKnownService } from "@zombills/core";
import type { CancelLinkKind, CancellationEmail, EmailInput } from "@zombills/core";
import type { AnswerRecord } from "./graveyard";
import { formatMoney } from "./money";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Known display name when serviceId is a Known service id, else null (getKnownService is a Map lookup). */
export function knownNameFor(serviceId: string | null): string | null {
  if (serviceId === null) return null;
  return getKnownService(serviceId)?.displayName ?? null;
}

/** Req 3.9: Known display name or merchant; formatMoney(currentAmountCents, currency, locale). */
export function emailInputFor(record: AnswerRecord, locale?: string): EmailInput {
  return {
    serviceName: knownNameFor(record.serviceId) ?? record.merchant,
    amountText: formatMoney(record.currentAmountCents, record.currency, locale),
    currency: record.currency,
    cadence: record.cadence,
    cadenceAssumed: record.cadenceAssumed,
  };
}

/** What Copy writes: subject, a blank line, body (Req 7.7). */
export function copyTextOf(email: CancellationEmail): string {
  return email.subject + "\n\n" + email.body;
}

function linkWord(linkKind: CancelLinkKind): string {
  switch (linkKind) {
    case "cancel":
      return "cancel page";
    case "manage":
      return "manage page";
    case "help":
      return "help page";
  }
}

/** "Open the Netflix cancel page (netflix.com)" (Req 7.5). */
export function cancelLinkText(
  linkKind: CancelLinkKind,
  serviceName: string,
  host: string,
): string {
  return `Open the ${serviceName} ${linkWord(linkKind)} (${host})`;
}

/** "<visible> for <displayName>" (Req 8.5). */
export function withFor(visible: string, displayName: string): string {
  return `${visible} for ${displayName}`;
}

/** "Link checked November 2026." in the locale and UTC; null when lastChecked is null or malformed (Req 7.5). */
export function checkedLine(lastChecked: string | null, locale?: string): string | null {
  if (lastChecked === null) return null;
  const match = ISO_DATE.exec(lastChecked);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Link checked ${formatter.format(Date.UTC(year, month - 1, day))}.`;
}

/** "Email for Netflix copied." (Req 8.3). */
export function copiedNotice(displayName: string): string {
  return `Email for ${displayName} copied.`;
}

export const PANEL_HEADING = "Seal the grave";
export const APP_STORE_NOTE =
  "If you pay through the App Store or Google Play, cancel there instead:";
export const LINK_INTRO = "Or ask them in writing:";
export const EMAIL_ONLY_INTRO = "No cancel page on file. Send them this instead:";
export const BRACKETS_NOTE = "Replace the words in [brackets] before you send it.";
export const MAILTO_HINT = "Opens your email app with this text filled in.";
export const NEW_TAB_TEXT = "(opens in a new tab)";
export const COPY_FAILED_NOTICE =
  "Could not copy. The email is selected, so copy it with your keyboard or menu.";

export function panelLine(displayName: string): string {
  return `Cancel ${displayName} with the provider. Burying it here does not stop the payments.`;
}
