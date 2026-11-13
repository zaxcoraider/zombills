# Product

## What we build

**Zombills** — a browser-only web app that finds zombie subscriptions in a bank statement CSV and helps the user cancel them, presented as a haunted graveyard.

**The Reaper** — a Kiro Crew app (separate repo) that watches a local folder for new statements each month, alerts the user via Telegram or Discord, and drafts cancellation emails on request.

## Who it's for

People with several streaming, app or software subscriptions who check their balance but never read the statement line by line. Especially users who value privacy and won't hand their bank login to a third-party service.

## One-sentence pitch

> "Your bank statement is haunted: we find the zombie subscriptions draining your money, and you bury them."

## Must-have scope (demo-critical)

- Drag-and-drop CSV upload plus built-in sample statements.
- Auto-detect common CSV layouts; column-mapping fallback when auto-detection fails.
- Recurring-charge detection: group by normalised merchant, detect cadence, compute yearly cost.
- Labels: **zombie** (forgotten), **possessed** (price increase), **trial trap** (converted trial).
- Keep / Bury interaction with animation; tombstone showing yearly saving; running savings total.
- Cancel helper: curated list of ~50 services with cancel URLs; email template generator for the rest.
- Graveyard view with total saved and shareable image.
- Live public URL; statement data never leaves the browser.

## Won't have (this hackathon)

- Bank-account linking (Plaid etc.) — privacy is a deliberate feature, not a gap.
- Auto-cancellation on the user's behalf.
- User accounts, cloud storage, or mobile apps.
- Scanned-PDF OCR.
- Multi-currency conversion.

## The spooky theme rule

**The theme must do real work.** Every spooky element must carry state, give feedback, or guide attention. If removing it changes nothing about the app's function, remove it. The metaphor is the UI: zombie = forgotten subscription, buried = cancelled, tombstone = proof of saving, graveyard = savings history. Take away the theme and you remove the way the app explains itself.
