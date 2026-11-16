import { describe, expect, it } from "vitest";
import * as text from "./share-card-text";

describe("share-card-text", () => {
  it("builds the ready notice from the alt text", () => {
    expect(text.imageReadyNotice("Alt text.")).toBe("Image ready. Alt text.");
  });

  it("states the download notice with the file name", () => {
    expect(text.DOWNLOAD_STARTED).toBe("Download started: zombills-graveyard.png.");
  });

  it("matches the texts of Req 4.2, 4.4, 4.6, 4.7 and 5.1 to 5.6", () => {
    expect(text.SHARE_HEADING).toBe("Share your graveyard");
    expect(text.SHARE_INTRO).toBe(
      "Make an image of your graveyard to share or save. It is made on this device and is not uploaded.",
    );
    expect(text.MAKE_IMAGE).toBe("Make an image");
    expect(text.MAKING_IMAGE).toBe("Making the image…");
    expect(text.MAKE_IMAGE_AGAIN).toBe("Make the image again");
    expect(text.IMAGE_UPDATED).toBe("Image updated.");
    expect(text.RENDER_FAILED).toBe("Could not make the image in this browser.");
    expect(text.SHARE_IMAGE).toBe("Share image");
    expect(text.SAVE_IMAGE).toBe("Save image");
    expect(text.SHARE_TITLE).toBe("My Zombills graveyard");
    expect(text.IMAGE_SHARED).toBe("Image shared.");
    expect(text.SHARE_FAILED).toBe("Could not share the image. Download started instead.");
    expect(text.SAVE_FAILED).toBe("Could not save the image in this browser.");
  });

  it("has no exclamation mark in any exported string", () => {
    const strings: string[] = [];
    for (const value of Object.values(text)) {
      if (typeof value === "string") strings.push(value);
    }
    expect(strings.length).toBeGreaterThan(10);
    for (const value of strings) expect(value).not.toContain("!");
    expect(text.imageReadyNotice("x")).not.toContain("!");
  });
});
