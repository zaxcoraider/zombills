// Folding: the comparison form used for matching and keys (glossary "Folding", Req 2.1).
// Locale-independent: only normalize(), toUpperCase() and toLowerCase().

/** Letters that NFKD does not decompose, mapped to their ASCII spelling (lower case). */
export const FOLD_LETTER_MAP: Readonly<Record<string, string>> = Object.freeze({
  ø: "o",
  Ø: "o",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  ð: "d",
  Ð: "d",
  þ: "th",
  Þ: "th",
});

const COMBINING_MARKS = /\p{M}/gu;
const MAPPED_LETTERS = /[øØæÆœŒłŁđĐðÐþÞ]/g;

/**
 * NFKD, remove combining marks, apply the letter map, then upper-case and lower-case.
 * The trip through upper case turns "ß" into "ss" and makes fold(s), fold(s.toUpperCase())
 * and fold(s.toLowerCase()) equal.
 */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(MAPPED_LETTERS, (letter) => FOLD_LETTER_MAP[letter] ?? letter)
    .toUpperCase()
    .toLowerCase();
}
