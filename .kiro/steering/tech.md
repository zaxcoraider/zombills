# Tech Stack

## Approved stack

| Layer | Library / Tool | Notes |
| --- | --- | --- |
| Bundler | Vite | |
| UI framework | React 18 + TypeScript | |
| Styling | Tailwind CSS | Utility classes; custom CSS tokens for the design system |
| Animation | Framer Motion | All motion goes through Framer Motion; no raw CSS keyframe hacks. Exception: the Landing effects of landing-polish Requirement 9.6 use CSS `@keyframes` and transitions in `apps/web/src/slice/landing/landing-motion.css` only. |
| CSV parsing | Papa Parse | Browser-native; no server needed |
| PDF parsing | pdf.js | Should-have; text-based PDFs only |
| Unit / property tests | Vitest + fast-check | fast-check for property-based tests in `packages/core` |
| E2E tests | Playwright | One demo-path test |
| Monorepo tooling | npm workspaces | `packages/core` shared by web and Reaper |
| Linting / formatting | ESLint + Prettier | |
| Hosting | Netlify (static, free tier) | No backend; deploy from `main` |

## Prefer the approved stack

Before adding any new library, check whether something in the list above already does the job. New dependencies need a clear reason: they add weight, maintenance risk, and drift from what the project has already proven out.

Specifically:
- Animation → Framer Motion, not React Spring, GSAP, or CSS-only keyframes. Exception: the Landing effects of landing-polish Requirement 9.6 use CSS `@keyframes` and transitions in `apps/web/src/slice/landing/landing-motion.css` only.
- State management → React built-ins (`useState`, `useReducer`, `useContext`); do not add Redux, Zustand, Jotai etc. unless a concrete problem demands it.
- Styling → Tailwind; do not add a component library (MUI, Chakra, shadcn) on top of it.
- HTTP → there is no backend; if a fetch call appears in `packages/core` or touches statement data anywhere, that is a privacy violation (see `privacy.md`).
- Testing → Vitest for unit tests, fast-check for property tests, Playwright for E2E; do not mix in Jest.

## TypeScript

Strict mode is on. No `any` without a comment explaining why it is unavoidable. Money values are `number` typed as integer cents — see `money.md`.
