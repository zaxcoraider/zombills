# Product

## What we build

**Zombills** — a browser-only web app that finds zombie subscriptions in a bank statement CSV and helps the user cancel them, presented as a haunted graveyard.

**The Reaper** — a Kiro Crew app (separate repo) that watches a local folder for new statements each month, alerts the user through Kiro Crew notifications and a dashboard page, and drafts cancellation emails on request.

## Who it's for

People with several streaming, app or software subscriptions who check their balance but never read the statement line by line. Especially users who value privacy and won't hand their bank login to a third-party service.

## One-sentence pitch

> "Your bank statement is haunted: we find the zombie subscriptions draining your money, and you bury them."

## Must-have scope (demo-critical)

- Drag-and-drop CSV upload plus built-in sample statements.
- Auto-detect common CSV layouts; column-mapping fallback when auto-detection fails.
- Recurring-charge detection: group by normalised merchant, detect cadence, compute yearly cost.
- Every detected recurring charge rises as an **undead** card asking "Still using this?". Answering no makes it a **zombie** (to bury); answering yes lets it rest (kept). A bank statement cannot show whether a service is still used, so the user decides.
- Labels derived from the data: **possessed** (price increase) and **trial trap** (first paid charge after a free or low-price period).
- Keep / Bury interaction with animation; tombstone showing yearly saving; running savings total.
- Cancel helper: curated list of ~50 services with cancel URLs; email template generator for the rest.
- Graveyard view with total saved.
- Live public URL; statement data never leaves the browser.

## Should have

- Shareable image of the graveyard.

## Won't have (this hackathon)

- Bank-account linking (Plaid etc.) — privacy is a deliberate feature, not a gap.
- Auto-cancellation on the user's behalf.
- User accounts, cloud storage, or mobile apps.
- Scanned-PDF OCR.
- Multi-currency conversion.

## The spooky theme rule

**The theme must do real work.** Every spooky element must carry state, give feedback, or guide attention. If removing it changes nothing about the app's function, remove it. The metaphor is the UI: undead = any detected recurring charge, zombie = an undead the user says they no longer use, buried = cancelled, tombstone = proof of saving, graveyard = savings history. Take away the theme and you remove the way the app explains itself.
