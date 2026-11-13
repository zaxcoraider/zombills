# Repo Structure

## Layout

```
/
├── .kiro/
│   ├── steering/          # this directory
│   ├── hooks/             # agent hooks (JSON)
│   ├── agents/            # custom agent definitions
│   └── specs/             # one sub-folder per feature spec
├── packages/
│   └── core/              # parser, normaliser, detector, classifier, cancel DB
│       └── src/
├── apps/
│   └── web/               # the Zombills site (Vite + React)
│       └── src/
├── samples/               # fake, anonymised CSV fixtures for demo and tests
├── LICENSE                # MIT
├── README.md
└── .gitignore
```

`.kiro/` is **never gitignored** — it is required evidence of Kiro usage for the hackathon.

Planning docs (`prd.md`, `architecture.md`, `design.md`, `phases.md`, `memory.md`, `rules.md`) live at the repo root and **are** gitignored — private notes, not published.

## Package names

| Path | Package name |
| --- | --- |
| `packages/core` | `@zombills/core` |
| `apps/web` | `@zombills/web` |

## Naming conventions

- **Files:** `kebab-case` for all source files (`merchant-normalizer.ts`, `zombie-card.tsx`).
- **Components:** PascalCase exports (`ZombieCard`, `BurialAnimation`).
- **Hooks:** `use` prefix, camelCase (`useGraveyard`, `useSubscriptionDetector`).
- **Types / interfaces:** PascalCase with no `I` prefix (`Transaction`, `Subscription`, `Burial`).
- **Constants:** `SCREAMING_SNAKE_CASE` for module-level constants.
- **CSS tokens:** `--kebab-case` custom properties matching the design token names in `spooky-design.md`.

## Where tests live

| Test kind | Location | File suffix |
| --- | --- | --- |
| Unit tests | Co-located with the source file | `.test.ts` / `.test.tsx` |
| Property-based tests | Co-located with the source file | `.property.test.ts` |
| E2E tests | `apps/web/e2e/` | `.spec.ts` |

Test files are never published to `dist`. The Vitest config excludes `e2e/` from the unit run; Playwright runs only the `e2e/` folder.

## Core module responsibilities

| Module | Responsibility |
| --- | --- |
| `core/parse` | CSV (and later PDF) → `Transaction[]`; column detection and mapping fallback |
| `core/normalize` | Raw description → clean merchant name (rules table + alias list) |
| `core/detect` | Group by merchant, find cadence, compute yearly cost; tolerates ±3-day drift and small amount changes |
| `core/classify` | Label subscriptions: `zombie`, `possessed`, `trial-trap` |
| `core/cancel` | Cancel URL database (~50 services) + email template generator |
