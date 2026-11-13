---
inclusion: fileMatch
fileMatchPattern: "apps/web/**"
---

# Spooky Design System

## Color tokens

Use these CSS custom properties everywhere. Never hard-code hex values.

| Token | Hex | Role |
| --- | --- | --- |
| `--night` | `#0B0D12` | Page background |
| `--fog` | `#1A1F2B` | Card and surface backgrounds |
| `--bone` | `#ECE6D6` | Body text |
| `--moss` | `#8FD694` | Zombie label, money-saved figures, `--moss`-glow focus ring |
| `--ember` | `#F2994A` | Possessed label, price-increase callouts |
| `--spectre` | `#A99BF2` | Trial-trap label |
| `--blood` | `#E05A5A` | Current cost, "still draining" figures |

Every text/background pair must meet **WCAG AA** (4.5:1 for body, 3:1 for large text). Verify with a contrast checker before shipping any new combination.

## Typography

- **Display headings:** `IM Fell English` (Google Fonts, SIL OFL). Gothic serif; sets the atmosphere.
- **Body text and all numbers:** `Inter` with `font-variant-numeric: tabular-nums`. Numbers must stay optically stable as they count up.
- Use the 8px grid for all spacing (`0.5rem` increments in Tailwind).

## Motion rules

All animation uses **Framer Motion**. No raw CSS `@keyframes` for interactive or state-driven motion.

| Animation | Style | Notes |
| --- | --- | --- |
| Zombie rise | Spring (`stiffness: 120, damping: 14`) | Cards rise from below on mount |
| Burial (sink) | Ease-in, ~600 ms | Zombie sinks; earth closes; tombstone rises |
| Tombstone rise | Spring (`stiffness: 80, damping: 12`) | After burial completes |
| Fog drift | Slow loop, 20–40 s | Ambient only; never obscures content |
| Savings counter | Tween, ~800 ms | Counts up to new total after burial |

**Reduced motion:** when `prefers-reduced-motion: reduce` is set, replace all spring/tween motion with an instant fade (`opacity` only, ≤ 150 ms). No position, scale, or rotation changes. Use Framer Motion's `useReducedMotion` hook.

## Accessibility rules

- Keyboard navigation must reach every interactive element. Focus ring: `--moss` glow, 2px offset.
- Labels are **never colour-only**: each subscription label (`zombie`, `possessed`, `trial trap`) has an icon and a word, not just a colour dot.
- No flashing content (no strobing, no rapid colour cycling).
- No jump scares or sudden loud audio.
- Sound is off by default; user must opt in.
- Cards stack to a single column at mobile widths (≤ 640 px).
- Money figures are always rendered in text, never as images.

## Tone of voice

Dry, playful undertaker. The copy treats every subscription like a deceased with a cause of death.

- "Here lies Adobe Creative Cloud. Unopened since August. Cost you $659 a year."
- "This one rose from the trial. It's been feeding since March."
- Keep sentences short. No exclamation points. Wry, not goofy.

## What not to do

- No service logos or brand assets of any kind — text names only.
- No gore, blood dripping from UI elements, or horror imagery beyond the graveyard metaphor.
- Spooky elements that carry no functional meaning must be removed. Atmosphere serves the UI; it does not replace it.

## Screens and their states

Every screen must have a designed state for: default, loading/processing, empty, and error. Partial implementations ship only when all four states are handled.
