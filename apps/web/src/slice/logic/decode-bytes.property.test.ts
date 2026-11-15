import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeStatementBytes } from "./decode-bytes";

/** Well-formed UTF-16 over all of Unicode, not starting with U+FEFF (TextDecoder strips it as a BOM). */
const textArb = fc.string({ unit: "binary" }).filter((s) => !s.startsWith("\uFEFF"));

function utf16Bytes(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  const view = new DataView(out.buffer);
  out[0] = littleEndian ? 0xff : 0xfe;
  out[1] = littleEndian ? 0xfe : 0xff;
  for (let i = 0; i < text.length; i += 1) {
    view.setUint16(2 + i * 2, text.charCodeAt(i), littleEndian);
  }
  return out;
}

/** The Windows-1252 characters at 0x80–0x9F that the TextDecoder maps away from C1 controls. */
const CP1252_HIGH = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const CP1252_CHARS = [
  ...Array.from({ length: 0x5f }, (_, i) => String.fromCharCode(0x20 + i)),
  ...CP1252_HIGH,
  ...Array.from({ length: 0x60 }, (_, i) => String.fromCharCode(0xa0 + i)),
];

function cp1252Bytes(text: string): Uint8Array {
  const decoder = new TextDecoder("windows-1252");
  const reverse = new Map<string, number>();
  for (let byte = 0; byte < 256; byte += 1) {
    reverse.set(decoder.decode(new Uint8Array([byte])), byte);
  }
  return Uint8Array.from(Array.from(text, (ch) => reverse.get(ch) as number));
}

const cp1252TextArb = fc
  .array(fc.constantFrom(...CP1252_CHARS), { minLength: 1, maxLength: 40 })
  .map((chars) => chars.join(""))
  .filter(
    (s) =>
      Array.from(s).some((ch) => ch.charCodeAt(0) > 0x7f) &&
      !s.startsWith("ÿþ") &&
      !s.startsWith("þÿ"),
  );

describe("P12: byte decoding", () => {
  it("P12: UTF-8 bytes decode to the string", () => {
    fc.assert(
      fc.property(textArb, (text) => {
        expect(decodeStatementBytes(new TextEncoder().encode(text))).toBe(text);
      }),
    );
  });

  it("P12: UTF-16 LE and BE bytes with a BOM decode to the string", () => {
    fc.assert(
      fc.property(textArb, (text) => {
        expect(decodeStatementBytes(utf16Bytes(text, true))).toBe(text);
        expect(decodeStatementBytes(utf16Bytes(text, false))).toBe(text);
      }),
    );
  });

  it("P12: Windows-1252 bytes decode to the string, or as UTF-8 when they are valid UTF-8", () => {
    fc.assert(
      fc.property(cp1252TextArb, (text) => {
        const encoded = cp1252Bytes(text);
        let validUtf8: string | null;
        try {
          validUtf8 = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
        } catch {
          validUtf8 = null;
        }
        expect(decodeStatementBytes(encoded)).toBe(validUtf8 ?? text);
      }),
    );
  });

  it("P12: never throws on any bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (input) => {
        expect(typeof decodeStatementBytes(input)).toBe("string");
      }),
    );
  });
});
