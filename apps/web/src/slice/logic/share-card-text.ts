import { SHARE_FILE_NAME } from "./share-card";

export const SHARE_HEADING = "Share your graveyard";
export const SHARE_INTRO =
  "Make an image of your graveyard to share or save. It is made on this device and is not uploaded.";
export const MAKE_IMAGE = "Make an image";
export const MAKING_IMAGE = "Making the image…";
export const MAKE_IMAGE_AGAIN = "Make the image again";
export const SHARE_IMAGE = "Share image";
export const SAVE_IMAGE = "Save image";
export const SHARE_TITLE = "My Zombills graveyard";

export const IMAGE_UPDATED = "Image updated.";
export const RENDER_FAILED = "Could not make the image in this browser.";
export const IMAGE_SHARED = "Image shared.";
export const SHARE_FAILED = "Could not share the image. Download started instead.";
export const DOWNLOAD_STARTED = `Download started: ${SHARE_FILE_NAME}.`;
export const SAVE_FAILED = "Could not save the image in this browser."; // Req 5.6, 7.5

/** "Image ready. <alt text>" (Req 4.4). */
export function imageReadyNotice(alt: string): string {
  return `Image ready. ${alt}`;
}
