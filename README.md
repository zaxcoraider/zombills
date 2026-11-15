# Zombills

> Your bank statement is haunted: we find the zombie subscriptions draining your money, and you bury them.

Built with [Kiro](https://kiro.dev) for the [Kiroween 2026](https://kiroween.devpost.com) hackathon, Costume Contest category.

## What it does

Zombills is a browser-only web app, presented as a haunted graveyard. You drop in a bank statement CSV and it finds the recurring charges.

- Drag-and-drop CSV upload, plus built-in sample statements.
- Auto-detects common CSV layouts, with a column-mapping fallback when detection fails.
- Detects recurring charges: groups by normalised merchant, detects cadence, and computes the yearly cost.
- Every recurring charge rises as an **undead** card asking "Still using this?". A bank statement cannot show whether you still use a service, so you decide. Answer no and it becomes a **zombie** to bury. Answer yes and it rests, kept.
- Labels charges as **possessed** (price increase) or **trial trap** (first paid charge after a free or low-price period), derived from the statement data.
- Keep or Bury with animation. A buried subscription gets a tombstone showing its yearly saving, and a running total tracks your savings.
- Cancel helper: a curated list of about 50 services with cancel URLs, and an email template generator for the rest.
- Graveyard view showing the total you have saved.

## Privacy

**Your statement data never leaves the browser.** Parsing, detection and classification all run on your device.

- No network call transmits transactions, merchant names or amounts.
- No backend, no analytics, no third-party requests at runtime. Fonts and icons are bundled with the app.
- No bank login and no account linking.
- If you choose to save your graveyard, it is stored in `localStorage` on your own device and synced nowhere.

## How it's built with Kiro

Kiro drives the project through steering files and specs, both committed in [`.kiro/`](.kiro/).

- [`.kiro/steering/`](.kiro/steering/) holds the standing rules the agent follows: product scope, tech stack, privacy guarantees, repo structure, money handling and the spooky design system.
- [`.kiro/specs/`](.kiro/specs/) holds one folder per feature, with requirements that the implementation is built from.

## Tech

Vite, React 18, TypeScript, Tailwind CSS, Framer Motion and Papa Parse. Tests use Vitest, fast-check and Playwright. The repo is an npm workspaces monorepo: `packages/core` (`@zombills/core`) and `apps/web` (`@zombills/web`). It is hosted on Netlify as a static site.

## Setup

Coming soon.

Run `npx playwright install chromium` once per machine before `npm run test:e2e --workspace @zombills/web`.

## License

[MIT](LICENSE)
