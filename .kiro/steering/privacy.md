# Privacy

## Core guarantee

**Statement data never leaves the browser.** This is the product's primary privacy promise and a deliberate design choice — it is what makes Zombills different from services that require a bank login.

## What this means in code

- No `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, WebSocket, or any other network call may transmit transaction data, merchant names, amounts, or anything derived from the user's statement.
- `packages/core` has **no backend**. It is a pure in-browser library. Any network call in that package is a bug.
- `apps/web` makes **zero third-party requests at runtime**. Fonts (IM Fell English, Inter) and icons are bundled with the app at build time — they are not loaded from Google Fonts, a CDN, or any external host.
- No analytics scripts, tracking pixels, or third-party SDKs that phone home with user behaviour tied to statement content.
- `localStorage` may be used to persist the user's graveyard (opt-in), but only on the user's own device. Nothing is synced to a server.

## What is explicitly forbidden

| Forbidden | Why |
| --- | --- |
| Sending CSV content or parsed transactions to any URL | Breaks the privacy promise |
| Adding an analytics SDK that samples page content | Could leak merchant names or amounts |
| Storing statement data in a cookie | Cookies are sent to the server on every request |
| Logging transaction data to a remote error tracker | Breaks the privacy promise |
| Any backend or serverless function that receives statement data | There is no backend by design |

## Enforcement

The `privacy-guard` hook checks for `fetch` and `XMLHttpRequest` in `packages/core` on every file save and flags any occurrence in `apps/web` that appears inside the statement-processing path. There is no legitimate runtime network call in this app — if one appears, it is a bug, not a configuration choice.
