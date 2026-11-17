import type { Page } from "@playwright/test";

// Helpers for the moon layout test (landing-polish design, "The moon layout test").
// Every box is in document coordinates, so one check covers every scroll position.

export interface DocRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: "text" | "card" | "control" | "art";
  label: string;
}

export interface MoonGeometry {
  count: number;
  shown: boolean;
  cx: number;
  cy: number;
  r: number;
  halo: { cx: number; cy: number };
  glow: { cx: number; cy: number };
}

/**
 * Every Content box of `header`, `main` and `footer`: text line fragments, Cards (background
 * alpha of 0.5 or more), controls, the Hero art and the brand mark. Excluded: anything inside an
 * `aria-hidden="true"` ancestor or a visually-hidden (`sr-only`) one, and zero-area boxes.
 * A page with no `footer` yields no footer boxes.
 */
export function collectContentBoxes(page: Page): Promise<DocRect[]> {
  return page.evaluate(() => {
    const out: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      kind: "text" | "card" | "control" | "art";
      label: string;
    }[] = [];
    const sx = window.scrollX;
    const sy = window.scrollY;

    const excluded = (start: Element | null): boolean => {
      for (let el = start; el !== null; el = el.parentElement) {
        if (el.getAttribute("aria-hidden") === "true") return true;
        const style = getComputedStyle(el);
        if (style.clipPath === "inset(50%)" || style.clip === "rect(0px, 0px, 0px, 0px)") {
          return true;
        }
      }
      return false;
    };

    const push = (
      kind: "text" | "card" | "control" | "art",
      label: string,
      r: { left: number; top: number; right: number; bottom: number },
    ) => {
      if (r.right - r.left <= 0 || r.bottom - r.top <= 0) return;
      out.push({
        x0: r.left + sx,
        y0: r.top + sy,
        x1: r.right + sx,
        y1: r.bottom + sy,
        kind,
        label,
      });
    };

    /** Alpha of a computed colour: rgba(), color(srgb … / a) or oklab(… / a). */
    const alphaOf = (color: string): number => {
      if (color === "rgba(0, 0, 0, 0)" || color === "transparent") return 0;
      const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
      if (slash?.[1] !== undefined) {
        const value = Number(slash[1]);
        return slash[2] === "%" ? value / 100 : value;
      }
      const rgba = /^rgba\(\s*[^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/.exec(color);
      if (rgba?.[1] !== undefined) return Number(rgba[1]);
      return 1;
    };

    const roots = Array.from(document.querySelectorAll("header, main, footer"));
    const seen = new Set<Element>();
    const CONTROL =
      'button, a[href], input:not([type="file"]), select, textarea, [role="button"], [tabindex="0"]';

    for (const root of roots) {
      const elements = [root, ...Array.from(root.querySelectorAll("*"))];
      for (const el of elements) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (excluded(el)) {
          // The Hero art and the brand mark are Content boxes although they are aria-hidden.
          if (el.hasAttribute("data-hero-art")) {
            push("art", "hero art", el.getBoundingClientRect());
          }
          if (el.hasAttribute("data-brand-mark")) {
            push("art", "brand mark", el.getBoundingClientRect());
          }
          continue;
        }
        const tag = el.tagName.toLowerCase();
        const text = (el as HTMLElement).innerText ?? "";
        const label = `${tag} ${text.slice(0, 40)}`;
        if (el.hasAttribute("data-hero-art")) push("art", "hero art", el.getBoundingClientRect());
        if (alphaOf(getComputedStyle(el).backgroundColor) >= 0.5) {
          push("card", label, el.getBoundingClientRect());
        }
        if (el.matches(CONTROL)) push("control", label, el.getBoundingClientRect());
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const content = node.textContent ?? "";
        if (content.trim() === "") continue;
        if (excluded(node.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          push("text", content.trim().slice(0, 40), rect);
        }
      }
    }
    return out;
  });
}

/** Counts every moon disc and measures the single disc, its halo and its glow. */
export function moonGeometry(page: Page): Promise<MoonGeometry> {
  return page.evaluate(() => {
    const centre = (el: Element | null) => {
      if (el === null) return { cx: Number.NaN, cy: Number.NaN, w: 0, h: 0 };
      const r = el.getBoundingClientRect();
      return {
        cx: r.left + r.width / 2 + window.scrollX,
        cy: r.top + r.height / 2 + window.scrollY,
        w: r.width,
        h: r.height,
      };
    };
    const discs = document.querySelectorAll("[data-moon-disc]");
    const disc = centre(discs[0] ?? null);
    const halo = centre(document.querySelector("[data-moon-halo]"));
    const glow = centre(document.querySelector("[data-moon-glow]"));
    return {
      count: discs.length,
      shown: disc.w > 0 && disc.h > 0,
      cx: disc.cx,
      cy: disc.cy,
      r: disc.w / 2,
      halo: { cx: halo.cx, cy: halo.cy },
      glow: { cx: glow.cx, cy: glow.cy },
    };
  });
}

/** Distance from (cx, cy) to the nearest point of the rectangle; 0 inside it. */
export function distanceToRect(cx: number, cy: number, rect: DocRect): number {
  const dx = Math.max(rect.x0 - cx, 0, cx - rect.x1);
  const dy = Math.max(rect.y0 - cy, 0, cy - rect.y1);
  return Math.hypot(dx, dy);
}

/** The disc covers the rectangle when the nearest point is closer than r − 0.5. */
export function circleHitsRect(cx: number, cy: number, r: number, rect: DocRect): boolean {
  return distanceToRect(cx, cy, rect) < r - 0.5;
}

/** The rectangle meets the visible viewport at this scroll position. */
export function inViewport(rect: DocRect, scrollY: number, width: number, height: number): boolean {
  return rect.x1 > 0 && rect.x0 < width && rect.y1 > scrollY && rect.y0 < scrollY + height;
}
