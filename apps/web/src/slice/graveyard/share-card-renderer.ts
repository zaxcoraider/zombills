// Draws the Share content onto a detached canvas and encodes it as one PNG (share-card Req 3).
// Nothing here is logged, stored or sent; the only outputs are a data URL and a File that the
// caller keeps in memory (Req 3.5, 3.7, 6.1, 6.2).

import {
  ROLE_STYLES,
  SHARE_FILE_NAME,
  SHARE_IMAGE_SIZE,
  SHARE_SITE_ADDRESS,
  SHARE_SITE_NAME,
  moreCurrenciesLine,
  shareCardLayout,
  type ColourToken,
  type DrawOp,
  type ShareCardContent,
} from "../logic/share-card";
import { ELLIPSIS, fontFor } from "../logic/share-card-fit";

/** The context members the Renderer uses. CanvasRenderingContext2D satisfies it. */
export type CanvasContextLike = Pick<
  CanvasRenderingContext2D,
  | "font"
  | "textAlign"
  | "textBaseline"
  | "fillStyle"
  | "globalAlpha"
  | "measureText"
  | "fillText"
  | "fillRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "arc"
  | "fill"
  | "createLinearGradient"
>;

export interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: "2d"): CanvasContextLike | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

/** document.fonts satisfies it. */
export interface FontLoader {
  readonly ready: Promise<unknown>;
  load(font: string, text?: string): Promise<unknown>;
}

export interface RenderDeps {
  /** Default: a new, detached <canvas> element */
  createCanvas?: () => CanvasLike;
  /** Default: document.fonts, or null when the API is missing */
  fonts?: FontLoader | null;
  /** Default: defaultResolveToken */
  resolveToken?: (token: ColourToken) => string;
}

export type RenderedShareCard = { readonly dataUrl: string; readonly file: File };

const ERR_NO_CANVAS = "share-card: no canvas";
const ERR_NO_CONTEXT = "share-card: no 2d context";
const ERR_DRAWING = "share-card: drawing failed";
const ERR_NO_PNG = "share-card: no png";
const ERR_READ_PNG = "share-card: could not read the png";

/** getComputedStyle(document.documentElement).getPropertyValue("--" + token).trim() */
export function defaultResolveToken(token: ColourToken): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--" + token)
    .trim();
}

/** The three faces of Req 3.2, each with the font at its start size and the texts drawn in it. */
export function facesToLoad(content: ShareCardContent): readonly { font: string; text: string }[] {
  const inter500: string[] = [];
  if (content.moreCurrencies > 0) inter500.push(moreCurrenciesLine(content.moreCurrencies));
  inter500.push(content.countLine, SHARE_SITE_ADDRESS, ELLIPSIS);
  return [
    {
      font: fontFor(ROLE_STYLES.brand, 72),
      text: SHARE_SITE_NAME + " " + ELLIPSIS,
    },
    ...(content.totalLines.length > 0
      ? [{ font: fontFor(ROLE_STYLES.total, 72), text: content.totalLines.join(" ") }]
      : []),
    { font: fontFor(ROLE_STYLES.count, 40), text: inter500.join(" ") },
  ];
}

function defaultFonts(): FontLoader | null {
  return typeof document !== "undefined" && document.fonts ? document.fonts : null;
}

/** Waits for the faces the layout will use. Never rejects (Req 3.2). */
async function loadFaces(fonts: FontLoader | null, content: ShareCardContent): Promise<void> {
  if (fonts === null) return;
  try {
    await fonts.ready;
  } catch {
    // Draw with whatever font the browser has.
  }
  await Promise.allSettled(
    facesToLoad(content).map((face) => {
      try {
        return fonts.load(face.font, face.text);
      } catch {
        return Promise.resolve();
      }
    }),
  );
}

function createCanvasElement(): CanvasLike {
  const element = document.createElement("canvas");
  // Wrapped because HTMLCanvasElement.getContext is overloaded and may not assign to CanvasLike.
  // The element is never added to the document (Req 3.7).
  return {
    get width() {
      return element.width;
    },
    set width(value: number) {
      element.width = value;
    },
    get height() {
      return element.height;
    },
    set height(value: number) {
      element.height = value;
    },
    getContext: (id) => element.getContext(id),
    toBlob: (callback, type) => element.toBlob(callback, type),
  };
}

function toPngBlob(canvas: CanvasLike): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(ERR_NO_PNG))), "image/png");
    } catch {
      reject(new Error(ERR_NO_PNG));
    }
  });
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error(ERR_READ_PNG));
      reader.onerror = () => reject(new Error(ERR_READ_PNG));
      reader.readAsDataURL(blob);
    } catch {
      reject(new Error(ERR_READ_PNG));
    }
  });
}

/** Executes one operation; resets globalAlpha to 1 afterwards. Exported for the path and gradient tests. */
export function drawOp(
  ctx: CanvasContextLike,
  op: DrawOp,
  resolveToken: (token: ColourToken) => string,
): void {
  const paint = (p: { readonly token: ColourToken; readonly alpha: number }): void => {
    ctx.fillStyle = resolveToken(p.token);
    ctx.globalAlpha = p.alpha;
  };
  try {
    switch (op.kind) {
      case "text":
        ctx.font = op.font;
        ctx.textAlign = op.align;
        ctx.textBaseline = "alphabetic";
        paint(op.fill);
        ctx.fillText(op.text, op.x, op.y);
        break;
      case "rect":
        paint(op.fill);
        ctx.fillRect(op.x, op.y, op.w, op.h);
        break;
      case "vertical-gradient": {
        const gradient = ctx.createLinearGradient(op.x, op.y, op.x, op.y + op.h);
        for (const stop of op.stops) gradient.addColorStop(stop.offset, resolveToken(stop.paint.token));
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 1;
        ctx.fillRect(op.x, op.y, op.w, op.h);
        break;
      }
      case "circle":
        paint(op.fill);
        ctx.beginPath();
        ctx.arc(op.cx, op.cy, op.r, 0, 2 * Math.PI);
        ctx.fill();
        break;
      case "path":
        paint(op.fill);
        ctx.beginPath();
        for (const c of op.commands) {
          if (c.op === "move") ctx.moveTo(c.x, c.y);
          else if (c.op === "line") ctx.lineTo(c.x, c.y);
          else ctx.closePath();
        }
        ctx.fill();
        break;
      default: {
        const unreachable: never = op;
        void unreachable;
      }
    }
  } finally {
    ctx.globalAlpha = 1;
  }
}

export async function renderShareCard(
  content: ShareCardContent,
  deps: RenderDeps = {},
): Promise<RenderedShareCard> {
  const createCanvas = deps.createCanvas ?? createCanvasElement;
  const fonts = deps.fonts !== undefined ? deps.fonts : defaultFonts();
  const resolveToken = deps.resolveToken ?? defaultResolveToken;

  await loadFaces(fonts, content);

  let canvas: CanvasLike;
  try {
    canvas = createCanvas();
  } catch {
    throw new Error(ERR_NO_CANVAS);
  }

  // Browser errors are replaced, never wrapped: their text could echo the content (Req 3.6).
  let ctx: CanvasContextLike | null;
  try {
    canvas.width = SHARE_IMAGE_SIZE;
    canvas.height = SHARE_IMAGE_SIZE;
    ctx = canvas.getContext("2d");
  } catch {
    throw new Error(ERR_NO_CONTEXT);
  }
  if (ctx === null) throw new Error(ERR_NO_CONTEXT);
  const context = ctx;

  try {
    const measure = (text: string, font: string): number => {
      context.font = font;
      return context.measureText(text).width;
    };
    for (const op of shareCardLayout(content, measure)) drawOp(context, op, resolveToken);
  } catch {
    throw new Error(ERR_DRAWING);
  }

  const blob = await toPngBlob(canvas);
  canvas.width = 0;
  canvas.height = 0;
  const dataUrl = await readDataUrl(blob);
  const file = new File([blob], SHARE_FILE_NAME, { type: "image/png" });
  return { dataUrl, file };
}
