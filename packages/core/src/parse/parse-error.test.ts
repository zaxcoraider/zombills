import { describe, expect, it } from "vitest";
import { ParseError } from "./parse-error.js";

describe("ParseError", () => {
  it("is an Error and a ParseError", () => {
    const error = new ParseError("amount", "Unparseable amount");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ParseError);
  });

  it("keeps the field and the message", () => {
    const error = new ParseError("date", "Expected dd/mm/yyyy");
    expect(error.field).toBe("date");
    expect(error.message).toBe("Expected dd/mm/yyyy");
  });

  it("is named ParseError so it is recognisable in stack traces", () => {
    expect(new ParseError("currency", "bad code").name).toBe("ParseError");
  });
});
