import type { Cadence } from "@zombills/core";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-01-12" → "12 Jan 2026" (Req 5.8). Returns the input unchanged if it is not yyyy-mm-dd. */
export function formatDisplayDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (match === null) return isoDate;
  const month = MONTHS[Number(match[2]) - 1];
  if (month === undefined) return isoDate;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export const CADENCE_LABELS: Readonly<Record<Cadence, string>> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};
