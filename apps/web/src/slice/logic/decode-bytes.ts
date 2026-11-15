// Req 3.10: UTF-16 by byte order mark, else strict UTF-8, else Windows-1252. Pure; never throws.

/** The BOM is checked first, so Windows-1252 bytes `FF FE` always decode as UTF-16 LE. */
export function decodeStatementBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // A bad UTF-8 sequence throws a TypeError; Windows-1252 accepts every byte.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
