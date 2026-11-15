import { describe, expect, it } from "vitest";
import { decodeStatementBytes } from "./decode-bytes";

const bytes = (...values: number[]) => new Uint8Array(values);
const utf8 = (text: string) => new TextEncoder().encode(text);

function utf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0xfeff, littleEndian);
  for (let i = 0; i < text.length; i += 1) {
    view.setUint16(2 + i * 2, text.charCodeAt(i), littleEndian);
  }
  return out;
}

describe("decodeStatementBytes", () => {
  it("decodes UTF-8 without a BOM", () => {
    expect(decodeStatementBytes(utf8("Café,£5"))).toBe("Café,£5");
  });

  it("decodes UTF-8 with a BOM and strips it", () => {
    expect(decodeStatementBytes(bytes(0xef, 0xbb, 0xbf, 0x61))).toBe("a");
  });

  it("strips a BOM from a UTF-8 string that starts with U+FEFF", () => {
    expect(decodeStatementBytes(utf8("\uFEFFa"))).toBe("a");
  });

  it("decodes UTF-16 LE with a BOM", () => {
    expect(decodeStatementBytes(utf16("Date,£", true))).toBe("Date,£");
  });

  it("decodes UTF-16 BE with a BOM", () => {
    expect(decodeStatementBytes(utf16("Date,£", false))).toBe("Date,£");
  });

  it("decodes the single byte 0xA3 as £ (Windows-1252)", () => {
    expect(decodeStatementBytes(bytes(0xa3))).toBe("£");
  });

  it("decodes the single byte 0x80 as € (Windows-1252, not Latin-1)", () => {
    expect(decodeStatementBytes(bytes(0x80))).toBe("€");
  });

  it("falls back to Windows-1252 on invalid continuation bytes", () => {
    expect(decodeStatementBytes(bytes(0x61, 0xc3, 0x28, 0x62))).toBe("aÃ(b");
    expect(decodeStatementBytes(bytes(0x80, 0x80))).toBe("€€");
  });

  it("treats Windows-1252 'ÿþab' (FF FE 61 62) as UTF-16 LE because the BOM comes first", () => {
    expect(decodeStatementBytes(bytes(0xff, 0xfe, 0x61, 0x62))).toBe("扡");
  });

  it("decodes empty input to the empty string", () => {
    expect(decodeStatementBytes(new Uint8Array())).toBe("");
  });
});
