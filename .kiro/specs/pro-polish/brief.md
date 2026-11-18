# pro-polish brief (from the user + Claude Code audit, 2026-11-18)

Goal: the screens after "Summon" and the site chrome must look as finished as the new landing, same haunted theme (night, moon, fog, tombstones, cream ghost with two oval eyes and no mouth, moss-green glow). All art is Kiro-made SVG/CSS. Evidence: screenshots of the built site at 1280x800 and 390x844 (results after Summon, after one Bury with "Seal the grave", graveyard view).

R1 Site header. On every screen after Summon (results, Seal the grave, graveyard): a compact header with the Z brand mark + "Zombills" wordmark as ONE link/button that returns to the landing (home). The saved-per-year counter stays in the header (right side). If the user has answered at least one card and graveyard memory is off, returning home asks first ("Leave the graveyard? Your answers are lost unless you remember your graveyard.") with Stay / Leave; otherwise it goes straight home. On the landing, the title stays as is (no nav needed). Keyboard and screen-reader friendly (it is a real link/button with a name like "Zombills, back to the start").

R2 Themed footer: "a small graveyard". Same footer on landing and all screens: a ground strip with a row of small tombstones; each tombstone is one footer link: "Zombills on GitHub", "The Reaper" (with its one-line description available, e.g. as visible small text under it or on the link page), "Privacy note", "Built with Kiro" (kiro.dev). Hover/focus: the tombstone lifts slightly and a tiny ghost peeks (motion rules apply; reduced motion = no movement, only a colour/outline change). One short privacy line stays. Phones: 2x2 grid, readable, touch targets >= 44 px. Replaces the current text footer.

R3 Statement panel ("Read another statement" / "Or read your own statement"): much cooler, ghost-themed. The drop zone becomes an open grave / coffin outline drawn in SVG; a small ghost rests in it; on drag-over the ghost rises and the grave glows moss green; "Choose a file" is a clear button inside the zone. Copy: heading "Or use your own statement" (landing) / "Try another statement" (results); hint "Most banks let you download your transactions as a CSV file. Look for Export or Download in online banking."; tip "Tip: 2 to 3 months of transactions works best." Samples become a row of small themed chips (e.g. tiny tombstone or scroll shape) with plain names: "US bank statement", "UK bank statement", "European bank statement", "Statement with extra top lines". On results/graveyard screens the whole panel is collapsed behind a "Try another statement" disclosure, together with "Start again".

R4 Share preview: meta description + Open Graph + Twitter card tags; a 1200x630 preview image drawn by Kiro (SVG source committed, PNG exported at build or committed) in the site style (night, moon, tombstone, ghost, "Zombills", "Your bank statement is haunted."). Same-origin file only (CSP unchanged for runtime requests).

R5 Results and graveyard screens: the night scene behaves like the fixed landing (ridge + fence band scrolls with the page, sky fades into the page, no pinned line, no hard-edged dark "stage" box under the card or tombstone).

R6 Button hierarchy across the app: variants primary (moss fill), secondary (outline), tertiary (text link style) and danger (for "Forget everything", "Unbury"). Exactly one primary per screen state (e.g. "No, bury it"/"Yes, let it rest" pair stays as designed; "Next" in Seal the grave is primary; "Open the graveyard" secondary; "Start again" tertiary). Consistent sizes, radii, focus rings; contrast >= 4.5:1.

R7 Desktop layout (>= lg): results use the width: card/tombstone stage on the left, summary + actions on the right; graveyard view shows tombstones in a wider grid. Phones unchanged in order.

R8 Seal the grave: cancel link + steps first; the email template behind a "Write to them instead" disclosure (copy/open-in-email buttons inside it); "Next" is the primary button inside the panel.

R9 Graveyard view: tombstones in a row on a ground line (grid, wraps), each with Unbury (danger, quiet) + How to cancel; "Not answered yet" as compact chips (name + yearly cost, click = answer now); Memory as one toggle with a short sentence and a "What is kept?" disclosure holding the current details text; "Back to the rising" secondary.

R10 Small polish: the "No currency was found…" note becomes a small muted footnote; "N of M answered" gets progress dots; the undead card float pauses on hover/focus and automatic motion stops within 5 s (WCAG 2.2.2) so it is easy to click.

R11 Landing copy: under the main button add "Free. No sign-up. No bank login."; sample names as in R3; footer privacy repetition trimmed (badge + privacy note stay).

Constraints: steering docs (privacy: no network calls, no third-party requests; spooky-design tokens; money handling unchanged), CSP unchanged for runtime, prefers-reduced-motion = still, automatic motion stops within 5 s, contrast >= 4.5:1, 320x568 Fold check and existing e2e stay green, never weaken or delete existing tests (amend only where a requirement here changes the behaviour, with a note), Kiro-made SVG/CSS only, no new runtime dependencies.
