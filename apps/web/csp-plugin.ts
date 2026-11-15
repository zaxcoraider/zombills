import type { Plugin } from "vite";

export const CSP_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; " +
  "img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'";

const CHARSET_META = /<meta\s+charset\s*=\s*["']?[^"'>\s]+["']?\s*\/?>/i;

/** Inserts the CSP meta tag straight after <meta charset>; throws if there is none. */
export function injectCsp(html: string): string {
  const match = CHARSET_META.exec(html);
  if (match === null) {
    throw new Error("zombills-csp: index.html has no <meta charset> tag to place the CSP after");
  }
  const end = match.index + match[0].length;
  const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}" />`;
  return `${html.slice(0, end)}\n    ${tag}${html.slice(end)}`;
}

export function cspPlugin(): Plugin {
  return {
    name: "zombills-csp",
    apply: "build",
    transformIndexHtml: { order: "post", handler: injectCsp },
  };
}
