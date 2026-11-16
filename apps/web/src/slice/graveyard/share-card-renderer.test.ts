// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  SHARE_FILE_NAME,
  SHARE_IMAGE_SIZE,
  SHARE_SITE_ADDRESS,
  shareCardLayout,
  type ColourToken,
  type DrawOp,
  type MeasureFn,
  type ShareCardContent,
} from "../logic/share-card";
import {
  defaultResolveToken,
  drawOp,
  facesToLoad,
  renderShareCard,
  type CanvasContextLike,
  type CanvasLike,
  type FontLoader,
} from "./share-card-renderer";

const CONTENT: ShareCardContent = {
  totalLines: ["I buried $215.88 a year.", "I buried €40.00 a year."],
  moreCurrencies: 1,
  countLine: "I buried 3 subscriptions.",
};
const NO_TOTALS: ShareCardContent = {
  totalLines: [],
  moreCurrencies: 0,
  countLine: "I buried 0 subscriptions. Saving unknown.",
};
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

type Entry = { readonly kind: "set" | "call" | "mark"; readonly name: string; readonly args: readonly unknown[] };
type Log = Entry[];

const fakeResolve = (token: ColourToken): string => `<${token}>`;
const fakeMeasure: MeasureFn = (text) => text.length * 10;

function makeCtx(log: Log, fail?: { fillText?: boolean }): CanvasContextLike {
  const values: Record<string, unknown> = {
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillStyle: "",
    globalAlpha: 1,
  };
  const call =
    <R>(name: string, result?: R) =>
    (...args: unknown[]): R => {
      log.push({ kind: "call", name, args });
      return result as R;
    };
  const ctx = {
    measureText: (text: string) => {
      log.push({ kind: "call", name: "measureText", args: [text] });
      return { width: text.length * 10 } as TextMetrics; // the Renderer reads only width
    },
    fillText: (...args: unknown[]) => {
      log.push({ kind: "call", name: "fillText", args });
      if (fail?.fillText) throw new Error(String(args[0]));
    },
    fillRect: call("fillRect"),
    beginPath: call("beginPath"),
    moveTo: call("moveTo"),
    lineTo: call("lineTo"),
    closePath: call("closePath"),
    arc: call("arc"),
    fill: call("fill"),
    createLinearGradient: (...args: unknown[]) => {
      log.push({ kind: "call", name: "createLinearGradient", args });
      // A fake gradient: only addColorStop is used, so the cast is limited to this one object.
      return {
        addColorStop: (...stop: unknown[]) => log.push({ kind: "call", name: "addColorStop", args: stop }),
      } as unknown as CanvasGradient;
    },
  };
  for (const name of Object.keys(values)) {
    Object.defineProperty(ctx, name, {
      get: () => values[name],
      set: (value: unknown) => {
        values[name] = value;
        log.push({ kind: "set", name, args: [value] });
      },
    });
  }
  return ctx as unknown as CanvasContextLike; // the defined accessors complete the Pick
}

type FakeCanvas = CanvasLike & {
  toDataURL: MockInstance;
  toBlobCalls: unknown[][];
  sizeAtToBlob: { width: number; height: number }[];
  blob: Blob;
};

type CanvasOptions = {
  ctx?: CanvasContextLike | null;
  getContextThrows?: boolean;
  widthThrows?: boolean;
  blob?: Blob | null;
  toBlobThrows?: boolean;
};

function makeCanvas(log: Log, options: CanvasOptions = {}): FakeCanvas {
  const blob = new Blob([PNG_BYTES], { type: "image/png" });
  let width = 300;
  let height = 150;
  const canvas: FakeCanvas = {
    get width() {
      return width;
    },
    set width(value: number) {
      if (options.widthThrows) throw new Error("size refused");
      width = value;
      log.push({ kind: "set", name: "canvas.width", args: [value] });
    },
    get height() {
      return height;
    },
    set height(value: number) {
      height = value;
    },
    getContext: () => {
      if (options.getContextThrows) throw new Error("no context for you");
      return options.ctx === undefined ? makeCtx(log) : options.ctx;
    },
    toBlob: (callback, ...rest) => {
      canvas.toBlobCalls.push([callback, ...rest]);
      canvas.sizeAtToBlob.push({ width, height });
      if (options.toBlobThrows) throw new Error("encoder broke");
      const result = options.blob === undefined ? blob : options.blob;
      queueMicrotask(() => callback(result));
    },
    toDataURL: vi.fn(),
    toBlobCalls: [],
    sizeAtToBlob: [],
    blob,
  };
  return canvas;
}

function makeFonts(log: Log, behaviour: "ok" | "ready-rejects" | "load-rejects" | "load-throws" = "ok"): FontLoader {
  return {
    ready:
      behaviour === "ready-rejects"
        ? Promise.reject(new Error("fonts broke"))
        : new Promise<void>((resolve) =>
            setTimeout(() => {
              log.push({ kind: "mark", name: "ready", args: [] });
              resolve();
            }, 0),
          ),
    load: (font, text) => {
      log.push({ kind: "call", name: "load", args: [font, text] });
      if (behaviour === "load-throws") throw new Error("load threw");
      return behaviour === "load-rejects" ? Promise.reject(new Error("load failed")) : Promise.resolve([]);
    },
  };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Error);
  return (error as Error).message;
}

function expectNoContent(message: string, content: ShareCardContent = CONTENT): void {
  for (const text of [...content.totalLines, content.countLine, SHARE_SITE_ADDRESS]) {
    expect(message).not.toContain(text);
  }
}

const indexesOf = (log: Log, name: string): number[] =>
  log.flatMap((entry, index) => (entry.name === name ? [index] : []));

let consoleSpies: MockInstance[] = [];

beforeEach(() => {
  consoleSpies = [
    vi.spyOn(console, "error").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "log").mockImplementation(() => undefined),
  ];
});

afterEach(() => {
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

async function render(
  content: ShareCardContent = CONTENT,
  options: CanvasOptions = {},
  fontsBehaviour: "ok" | "ready-rejects" | "load-rejects" | "load-throws" | null = "ok",
) {
  const log: Log = [];
  const canvas = makeCanvas(log, { ctx: makeCtx(log), ...options });
  const fonts = fontsBehaviour === null ? null : makeFonts(log, fontsBehaviour);
  const result = await renderShareCard(content, { createCanvas: () => canvas, fonts, resolveToken: fakeResolve });
  return { log, canvas, result };
}

describe("renderShareCard drawing", () => {
  it("sizes the canvas 1080 x 1080 before toBlob, then shrinks it to 0 x 0", async () => {
    const { canvas } = await render();
    expect(canvas.sizeAtToBlob).toEqual([{ width: SHARE_IMAGE_SIZE, height: SHARE_IMAGE_SIZE }]);
    expect(SHARE_IMAGE_SIZE).toBe(1080);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("awaits fonts.ready and loads each face with its texts before the first measureText", async () => {
    const { log } = await render();
    const ready = indexesOf(log, "ready");
    const loads = indexesOf(log, "load");
    const firstMeasure = indexesOf(log, "measureText")[0] ?? -1;
    expect(ready).toHaveLength(1);
    expect(loads).toHaveLength(3);
    expect(firstMeasure).toBeGreaterThan(-1);
    for (const index of loads) {
      expect(index).toBeGreaterThan(ready[0] as number);
      expect(index).toBeLessThan(firstMeasure);
    }
    const faces = loads.map((index) => log[index]?.args as [string, string]);
    const brand = faces.find(([font]) => font.startsWith("400 "));
    const total = faces.find(([font]) => font.startsWith("600 "));
    const inter = faces.find(([font]) => font.startsWith("500 "));
    expect(brand?.[0]).toContain("IM Fell English");
    expect(brand?.[1]).toContain("Zombills");
    expect(brand?.[1]).toContain("…");
    expect(total?.[0]).toContain("Inter");
    for (const line of CONTENT.totalLines) expect(total?.[1]).toContain(line);
    expect(inter?.[0]).toContain("Inter");
    for (const text of ["+1 more", CONTENT.countLine, SHARE_SITE_ADDRESS, "…"]) {
      expect(inter?.[1]).toContain(text);
    }
  });

  it("skips the Inter 600 face when there is no total line", async () => {
    const { log } = await render(NO_TOTALS);
    const fonts = indexesOf(log, "load").map((index) => (log[index]?.args as [string, string])[0]);
    expect(fonts).toHaveLength(2);
    expect(fonts.some((font) => font.startsWith("600 "))).toBe(false);
    const inter = log[indexesOf(log, "load")[1] as number]?.args as [string, string];
    expect(inter[1]).not.toContain("more");
    expect(facesToLoad(NO_TOTALS)).toHaveLength(2);
    expect(facesToLoad(CONTENT)).toHaveLength(3);
  });

  it("calls fillText with exactly three arguments and the layout's texts in order", async () => {
    const { log } = await render();
    const expected = shareCardLayout(CONTENT, fakeMeasure).flatMap((op) => (op.kind === "text" ? [op] : []));
    const calls = log.filter((entry) => entry.name === "fillText");
    expect(calls.map((entry) => entry.args)).toEqual(expected.map((op) => [op.text, op.x, op.y]));
    for (const entry of calls) expect(entry.args).toHaveLength(3);
  });

  it("sets font, textAlign, textBaseline and fillStyle before each fillText", async () => {
    const { log } = await render();
    const textOps = shareCardLayout(CONTENT, fakeMeasure).flatMap((op) => (op.kind === "text" ? [op] : []));
    const fills = indexesOf(log, "fillText");
    const lastMeasure = indexesOf(log, "measureText").at(-1) ?? -1;
    expect(fills).toHaveLength(textOps.length);
    fills.forEach((fillAt, i) => {
      const op = textOps[i] as (typeof textOps)[number];
      const from = Math.max(i === 0 ? -1 : (fills[i - 1] as number), lastMeasure);
      const lastSet = (name: string): unknown => {
        const index = indexesOf(log, name).filter((at) => at > from && at < fillAt && log[at]?.kind === "set").at(-1);
        expect(index, `${name} set before fillText #${i}`).toBeDefined();
        return log[index as number]?.args[0];
      };
      expect(lastSet("font")).toBe(op.font);
      expect(lastSet("textAlign")).toBe("center");
      expect(lastSet("textBaseline")).toBe("alphabetic");
      expect(lastSet("fillStyle")).toBe(`<${op.fill.token}>`);
      expect(lastSet("globalAlpha")).toBe(op.fill.alpha);
    });
  });

  it("writes each Paint alpha to globalAlpha and resets it to 1 after every operation", async () => {
    const { log } = await render();
    const writes = log.flatMap((entry, index) => (entry.kind === "set" && entry.name === "globalAlpha" ? [index] : []));
    const values = writes.map((index) => log[index]?.args[0]);
    const alphas = shareCardLayout(CONTENT, fakeMeasure).flatMap((op) =>
      op.kind === "vertical-gradient" ? [] : [op.fill.alpha],
    );
    for (const alpha of new Set(alphas)) expect(values).toContain(alpha);
    expect([...new Set(alphas)].some((alpha) => alpha !== 1)).toBe(true);
    values.forEach((value, i) => {
      if (value !== 1) expect(values[i + 1]).toBe(1);
    });
    expect(values.at(-1)).toBe(1);
  });
});

describe("renderShareCard encoding", () => {
  it("calls toBlob once with image/png and never toDataURL", async () => {
    const { canvas } = await render();
    expect(canvas.toBlobCalls).toHaveLength(1);
    expect(canvas.toBlobCalls[0]?.[1]).toBe("image/png");
    expect(canvas.toDataURL).not.toHaveBeenCalled();
  });

  it("takes dataUrl from readAsDataURL on the Blob that toBlob produced", async () => {
    const spy = vi.spyOn(FileReader.prototype, "readAsDataURL");
    const { canvas, result } = await render();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe(canvas.blob);
    expect(result.dataUrl).toBe(`data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`);
  });

  it("returns a File with the share name, image/png and the Blob's bytes", async () => {
    const { result } = await render();
    expect(result.file).toBeInstanceOf(File);
    expect(result.file.name).toBe(SHARE_FILE_NAME);
    expect(result.file.name).toBe("zombills-graveyard.png");
    expect(result.file.type).toBe("image/png");
    expect(new Uint8Array(await result.file.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("logs nothing", async () => {
    await render();
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("renderShareCard failures", () => {
  const run = (options: CanvasOptions, createCanvas?: () => CanvasLike) => {
    const log: Log = [];
    const canvas = makeCanvas(log, options);
    return renderShareCard(CONTENT, {
      createCanvas: createCanvas ?? (() => canvas),
      fonts: null,
      resolveToken: fakeResolve,
    });
  };

  it("rejects with 'no canvas' when the canvas cannot be created", async () => {
    const message = await failure(
      run({}, () => {
        throw new Error(CONTENT.countLine);
      }),
    );
    expect(message).toBe("share-card: no canvas");
    expectNoContent(message);
  });

  it.each([
    ["a null context", { ctx: null }],
    ["a getContext that throws", { getContextThrows: true }],
    ["a size setter that throws", { widthThrows: true }],
  ] satisfies [string, CanvasOptions][])("rejects with 'no 2d context' for %s", async (_name, options) => {
    const message = await failure(run(options));
    expect(message).toBe("share-card: no 2d context");
    expectNoContent(message);
  });

  it("rejects with 'drawing failed' when fillText throws, without the browser's message", async () => {
    const log: Log = [];
    const canvas = makeCanvas(log, { ctx: makeCtx(log, { fillText: true }) });
    const message = await failure(
      renderShareCard(CONTENT, { createCanvas: () => canvas, fonts: null, resolveToken: fakeResolve }),
    );
    expect(message).toBe("share-card: drawing failed");
    expectNoContent(message);
  });

  it("rejects with 'drawing failed' when the token resolves to nothing usable", async () => {
    const log: Log = [];
    const canvas = makeCanvas(log, { ctx: makeCtx(log) });
    const message = await failure(
      renderShareCard(CONTENT, {
        createCanvas: () => canvas,
        fonts: null,
        resolveToken: () => {
          throw new Error(CONTENT.totalLines[0]);
        },
      }),
    );
    expect(message).toBe("share-card: drawing failed");
    expectNoContent(message);
  });

  it.each([
    ["a null blob", { blob: null }],
    ["a toBlob that throws", { toBlobThrows: true }],
  ] satisfies [string, CanvasOptions][])("rejects with 'no png' for %s", async (_name, options) => {
    const message = await failure(run(options));
    expect(message).toBe("share-card: no png");
    expectNoContent(message);
  });

  it("rejects with 'could not read the png' on a FileReader error", async () => {
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      setTimeout(() => this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>), 0);
    });
    const message = await failure(run({}));
    expect(message).toBe("share-card: could not read the png");
    expectNoContent(message);
  });

  it("rejects with 'could not read the png' when the reader result is not a string", async () => {
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      setTimeout(() => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>), 0);
    });
    expect(await failure(run({}))).toBe("share-card: could not read the png");
  });

  it("rejects with 'could not read the png' when readAsDataURL throws", async () => {
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(() => {
      throw new Error("reader broke");
    });
    expect(await failure(run({}))).toBe("share-card: could not read the png");
  });
});

describe("renderShareCard fonts", () => {
  it.each([
    ["no font API", null],
    ["a rejecting ready", "ready-rejects"],
    ["a rejecting load", "load-rejects"],
    ["a throwing load", "load-throws"],
  ] as const)("still draws and resolves with %s", async (_name, behaviour) => {
    const { log, result } = await render(CONTENT, {}, behaviour);
    expect(indexesOf(log, "fillText").length).toBeGreaterThan(0);
    expect(result.file.name).toBe(SHARE_FILE_NAME);
    if (behaviour === "load-rejects" || behaviour === "load-throws") {
      expect(indexesOf(log, "load")).toHaveLength(3);
    }
  });
});

describe("drawOp", () => {
  const callNames = (log: Log): string[] => log.filter((entry) => entry.kind === "call").map((entry) => entry.name);
  const written = (log: Log, name: string): unknown[] =>
    log.filter((entry) => entry.kind === "set" && entry.name === name).map((entry) => entry.args[0]);

  it("draws a hand-built path with its commands in order", () => {
    const log: Log = [];
    const op: DrawOp = {
      kind: "path",
      commands: [
        { op: "move", x: 1, y: 2 },
        { op: "line", x: 3, y: 4 },
        { op: "line", x: 5, y: 6 },
        { op: "close" },
      ],
      fill: { token: "moss", alpha: 0.5 },
    };
    drawOp(makeCtx(log), op, fakeResolve);
    expect(callNames(log)).toEqual(["beginPath", "moveTo", "lineTo", "lineTo", "closePath", "fill"]);
    expect(log.filter((entry) => entry.name === "moveTo")[0]?.args).toEqual([1, 2]);
    expect(log.filter((entry) => entry.name === "lineTo").map((entry) => entry.args)).toEqual([
      [3, 4],
      [5, 6],
    ]);
    expect(written(log, "fillStyle")).toEqual(["<moss>"]);
    expect(written(log, "globalAlpha")).toEqual([0.5, 1]);
  });

  it("draws a vertical gradient with one colour stop per stop and alpha 1", () => {
    const log: Log = [];
    const op: DrawOp = {
      kind: "vertical-gradient",
      x: 10,
      y: 20,
      w: 100,
      h: 200,
      stops: [
        { offset: 0, paint: { token: "night", alpha: 1 } },
        { offset: 1, paint: { token: "fog", alpha: 1 } },
      ],
    };
    drawOp(makeCtx(log), op, fakeResolve);
    expect(callNames(log)).toEqual(["createLinearGradient", "addColorStop", "addColorStop", "fillRect"]);
    expect(log[0]?.args).toEqual([10, 20, 10, 220]);
    expect(log.filter((entry) => entry.name === "addColorStop").map((entry) => entry.args)).toEqual([
      [0, "<night>"],
      [1, "<fog>"],
    ]);
    expect(log.find((entry) => entry.name === "fillRect")?.args).toEqual([10, 20, 100, 200]);
    expect(written(log, "globalAlpha")).toEqual([1, 1]);
  });

  it("draws a rect and a circle", () => {
    const log: Log = [];
    const ctx = makeCtx(log);
    drawOp(ctx, { kind: "rect", x: 1, y: 2, w: 3, h: 4, fill: { token: "fog", alpha: 0.25 } }, fakeResolve);
    drawOp(ctx, { kind: "circle", cx: 5, cy: 6, r: 7, fill: { token: "bone", alpha: 0.75 } }, fakeResolve);
    expect(callNames(log)).toEqual(["fillRect", "beginPath", "arc", "fill"]);
    expect(log.find((entry) => entry.name === "arc")?.args).toEqual([5, 6, 7, 0, 2 * Math.PI]);
    expect(written(log, "globalAlpha")).toEqual([0.25, 1, 0.75, 1]);
  });

  it("resets globalAlpha to 1 even when the operation throws", () => {
    const log: Log = [];
    const op: DrawOp = {
      kind: "text",
      role: "brand",
      text: "x",
      x: 1,
      y: 2,
      align: "center",
      font: "400 10px serif",
      sizePx: 10,
      maxWidth: 100,
      fill: { token: "bone", alpha: 0.4 },
    };
    expect(() => drawOp(makeCtx(log, { fillText: true }), op, fakeResolve)).toThrow();
    expect(written(log, "globalAlpha")).toEqual([0.4, 1]);
  });
});

describe("defaultResolveToken", () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../index.css"), "utf8");
  const tokens = ["night", "fog", "bone", "moss"] as const;

  afterEach(() => {
    for (const token of tokens) document.documentElement.style.removeProperty(`--${token}`);
  });

  it.each(tokens)("returns the index.css value of --%s", (token) => {
    const match = new RegExp(`--${token}:\\s*([^;]+);`).exec(css);
    expect(match).not.toBeNull();
    const value = (match as RegExpExecArray)[1]?.trim() as string;
    for (const other of tokens) {
      const otherMatch = new RegExp(`--${other}:\\s*([^;]+);`).exec(css);
      document.documentElement.style.setProperty(`--${other}`, ` ${otherMatch?.[1]?.trim()} `);
    }
    expect(defaultResolveToken(token)).toBe(value);
  });
});

describe("default canvas", () => {
  it("uses a detached canvas element that never joins the document", async () => {
    const log: Log = [];
    const created = vi.spyOn(document, "createElement");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      // The fake context stands in for the browser's; only the Renderer's members are used.
      () => makeCtx(log) as unknown as CanvasRenderingContext2D,
    );
    const blob = new Blob([PNG_BYTES], { type: "image/png" });
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(blob));
    const result = await renderShareCard(CONTENT, { fonts: null, resolveToken: fakeResolve });
    expect(created).toHaveBeenCalledWith("canvas");
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toBlob.mock.calls[0]?.[1]).toBe("image/png");
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
    expect(result.file.name).toBe(SHARE_FILE_NAME);
  });
});
