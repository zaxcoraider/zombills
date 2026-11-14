# Implementation Plan: merchant-normalizer

Tasks run in dependency order. Every source file lives in `packages/core/src/normalize/` unless a path says otherwise. Each task writes its code and its tests together, and is done only when `npm test -w @zombills/core` passes. Property IDs (P1–P13) refer to the Testing strategy in `design.md`, and every property test's name starts with its ID (e.g. `"P6: cleanup fixed point"`).

The tasks are grouped into batches of 3–4. The whole suite, including the existing statement-parser tests, must be green at the end of every batch, and also at the end of each task within it.

Rules that apply to every task:

- The Normalizer reads `description` only. It never reads, computes or changes `amountCents`, `date` or `currency` (`money.md`, Req 8.4).
- No network, DOM, `localStorage`, `console.*`, `Intl`, `Date` or `toLocale*` in `src/normalize` (`privacy.md`, design "Privacy and environment").
- No mutable module-level state. Module-level data is frozen; the variant index is built once and only read (Req 10.4).
- Every regex runs on a single token or gap, uses the `u` flag and has no nested quantifiers (design "Performance").
- Files are kebab-case, constants are `SCREAMING_SNAKE_CASE`, unit tests go in `*.test.ts` and property tests in `*.property.test.ts` next to the source file (`structure.md`).
- TypeScript strict mode. Any `any` needs a comment explaining why (`tech.md`). Every relative import ends in `.js` (design "Module format").
- `packages/core` already exists. No scaffold or dependency changes are needed; `vitest` and `fast-check` are installed.

---

## Batch 1: foundations

- [x] 1. Public types, internal types and folding
  - In `types.ts`, write `MerchantSource`, `ProcessorId`, `ServiceCategory`, `ServiceVariant`, `KnownService`, `MerchantIdentity` and `NormalizedTransaction` exactly as in design "Public types". Import `Transaction` from `../parse/types.js` as a type only, and do not re-export it.
  - In `internal-types.ts`, write `Lexeme`, `Token`, `RemovalReason` and `CleanResult` as in design "Internal types".
  - In `fold.ts`, write `FOLD_LETTER_MAP` (frozen) and `fold(text)`: NFKD, remove `\p{M}`, apply the letter map, then `.toUpperCase().toLowerCase()`.
  - Create `index.ts` exporting the public types only, and add `export * from "./normalize/index.js";` to `packages/core/src/index.ts`.
  - Unit tests (`fold.test.ts`): `Café` → `cafe`; `STRAßE` → `strasse`; `Ørsted` → `orsted`; `Æble` → `aeble`; `Łódź` → `lodz`; `Þór` → `thor`; Cyrillic `ЯНДЕКС` → `яндекс`; `fold(s)`, `fold(s.toUpperCase())` and `fold(s.toLowerCase())` are equal for these samples; lone surrogates and emoji do not throw.
  - _Requirements: 1.1 (types), 2.1, 2.3, 2.5; glossary Folding, MerchantIdentity, MerchantSource, NormalizedTransaction_

- [x] 2. Lexer (`lex.ts`)
  - Write `lex(nfkcText)`: one left-to-right scan with one character of lookahead, producing alternating `word` and `gap` lexemes, each with `raw` and `folded = fold(raw)`.
    - Word characters: `\p{L}`, `\p{N}`, `\p{M}`.
    - `&`, `'`, `’`, `-`, `.` join a word only between a word character and a following letter or digit.
    - `+` joins a word after a word character when a letter or digit follows, or when it directly follows a letter.
    - Everything else, including whitespace, `#`, `@`, emoji, control characters and lone surrogates, belongs to a gap.
  - Write `joinTokens(tokens, form)`, which joins `raw` or `folded` text with single spaces.
  - Unit tests (`lex.test.ts`): `AT&T`, `MCDONALD'S`, `JOE’S`, `DISNEY+`, `APPLE TV+`, `7-ELEVEN` are one word each; `A--B` is two words; `APPLE.COM/BILL` → `apple.com`, `/`, `bill`; `****1234` → gap, word; `(800) 123` → `(`, `800`, `) `, `123`; `03.01.` → `03.01`, `.`; a trailing `.` or `-` is a gap; empty input gives `[]`; fullwidth `ＮＥＴＦＬＩＸ＊` after NFKC gives `NETFLIX` and `*`; lexing `joinTokens(x, "raw")` gives the same words with `" "` gaps.
  - _Requirements: 3.1_

- [x] 3. Noise lists and token-list helpers (`noise-lists.ts`, `token-list.ts`)
  - In `noise-lists.ts`, write as frozen constants:
    - `CARD_PREFIXES`, every Req 3.2 entry as a folded token sequence, sorted longest first;
    - `PROCESSOR_FORMS` (the design's step-3 table) and `PROCESSOR_NAMES` (Req 6.4 display names);
    - `MONTHS`, `TLDS` (the Req 3.7 list plus `ca`, `au`, `ch`, `at`, `se`, `ie`, `be`, `info`);
    - `US_STATE_CODES` (including DC, PR, GU, VI, AS, MP), `CA_PROVINCE_CODES` (13), `ISO_COUNTRY_CODES` (249 alpha-2 codes), and `LOCATION_CODES` as their union plus `usa`, all folded.
  - In `token-list.ts`, write the helpers from design "Token list helpers": building `Token`s from lexemes (with `gapBefore` and `span`), a linear filter that merges a removed token's `gapBefore` into the next token's, cursor-based leading and trailing loops, and a removal log of `{ reason, span }`.
  - Unit tests (`noise-lists.test.ts`): `CARD_PREFIXES` is sorted by token count, longest first, and contains every Req 3.2 entry; `ISO_COUNTRY_CODES` has 249 unique entries; every constant is frozen; `"am"` is in `LOCATION_CODES` (so the trailing-only rule matters).
  - Unit tests (`token-list.test.ts`): removing a token keeps the gaps of the removed tokens on the next token (`PAYPAL 12/03 *X` without the date leaves `X` with a gap containing `*`); removing the last token is safe; the removal log records reason and span.
  - _Requirements: 3.2 (list), 3.4 (list), 3.7 (TLD list), 3.10 (code lists), 6.4 (names)_

> **Batch 1 done:** `npm test -w @zombills/core` green; the statement-parser suite is unchanged.

---

## Batch 2: cleaning rules

Each rule is a function `(tokens, ctx) => tokens` that logs its removals. `ctx` carries `firstPass: boolean` and the recorded processor. Every task's tests call the rule directly on lexed input.

- [x] 4. Masked card numbers and dates (`rule-card-numbers.ts`, `rule-dates.ts`)
  - Step 1: remove `^x{2,}[0-9]{4}$` words, 4-digit words whose `gapBefore` ends in two or more `*`, and the sequences `card dddd`, `card ending dddd`, `card no dddd`.
  - Step 2: remove the date forms in the design's table (ISO, dot with optional year, dash, slash with an optional third part in pass 1 only, joined month, spaced month with the stack), only when at least one reading has day 1–31 and month 1–12.
  - Unit tests (`rule-card-numbers.test.ts`): `XXXX1234`, `****1234`, `CARD 1234`, `CARD ENDING 1234`, `CARD NO 1234` removed; `XX123`, `X1234`, `CARD 12345` kept.
  - Unit tests (`rule-dates.test.ts`): every Req 3.5 form removed (`2026-03-12`, `12/03`, `12/03/26`, `12/03/2026`, `03.01`, `03.01.2026`, `12-03`, `12JAN`, `JAN12`, `12 JAN`, `JAN 12`); `31/13` and `32.01` and `00/05` kept; `12/03` with `firstPass: false` is not seen as a date because the gap is a space; `12 12 JAN JAN` cleared in one pass; `866-579-7172` untouched.
  - _Requirements: 3.3, 3.5, 7.5_

- [x] 5. Card prefixes and processor forms (`rule-prefixes.ts`)
  - Step 3, the leading loop from the design: the longest card prefix first; then the processor form when none is recorded yet (the `*` forms only in pass 1, `apple.com` + `/` + `bill`, the Amazon forms with the 2-letter-code condition); then further leading Amazon forms removed without recording.
  - Unit tests (`rule-prefixes.test.ts`):
    - each Req 3.2 prefix removed at the start, the longest of overlapping prefixes first, repeated prefixes cleared, a prefix in the middle kept (`NETFLIX POS`);
    - each processor form in the Req 3.4 table recorded with its `ProcessorId`;
    - `GOOGLE STORAGE`, `SQUARESPACE`, `PAYPAL INC` and `SQ FOO` (no `*`) are not processors;
    - `AMZN MKTP US*2K4LJ8MB3` records `amazon-marketplace` and consumes `US`; `AMZN MKTP PS PLUS` keeps `PS`;
    - `SQ *AMZN MKTP FOO` records `square` and removes `AMZN MKTP`;
    - `PAYPAL *SQ *FOO` records only `paypal`, and the second form is not removed;
    - `SEPA-LASTSCHRIFT SPOTIFY AB` → `SPOTIFY AB`; `KARTENZAHLUNG NETFLIX` → `NETFLIX`.
  - _Requirements: 3.2, 3.4, 7.4_

- [x] 6. Phone numbers and domains (`rule-phones.ts`, `rule-domains.ts`)
  - Step 4, the three phone shapes in the design: a single digit-group word with 7–15 digits; a `+`- or `(`-marked run; the unmarked NANP-shaped spaced run with an optional leading `1`. Digit groups are checked with a character loop.
  - Step 5: drop `http`/`https` before `://` (pass 1); strip a leading `www.` from `raw` and `folded` at the same dot; apply the domain test; replace a first-token domain with its name label and remove any other domain; drop the path segments after a domain (pass 1).
  - Unit tests (`rule-phones.test.ts`): `866-579-7172`, `1-800-123-4567`, `866.579.7172`, `8665797172`, `(800) 123 4567`, `+44 20 7946 0958`, `866 579 7172`, `1 866 579 7172` removed; `MICROSOFT 365 866 579 7172` keeps `365`; `123-456` (6 digits) and a 16-digit group kept.
  - Unit tests (`rule-domains.test.ts`): `NETFLIX.COM` → `NETFLIX`; `HELP.MAX.COM` → `MAX`; `WWW.NYTIMES.COM` → `NYTIMES`; `https://www.netflix.com/account` → `NETFLIX`; `AUDIBLE AMZN.COM/BILL NJ` → `AUDIBLE NJ` (the `NJ` goes later, in step 8); `BBC.CO.UK` → `BBC`; `G.CO/HELPPAY` removed when not first; `NETFLIX.XYZ` and `A..COM` are not domains; raw case is kept in the label.
  - _Requirements: 3.6, 3.7_

- [x] 7. References, store numbers and the trailing loop (`rule-references.ts`, `rule-trailing.ts`)
  - Steps 6 and 7, in this order: store numbers (`#ddd` in pass 1; `store ddd`, `no ddd`, `nr ddd`) first, then reference tokens (4+ digits, or 6+ letters and digits with at least 2 digits and 1 letter). Store numbers run first so `WALGREENS STORE 1234` and `FOO STORE 0412` lose both `STORE` and the number.
  - Step 8: the trailing loop removing digits-only tokens and location codes, keeping a lone location code only when no processor is recorded.
  - Unit tests (`rule-references.test.ts`): `2K4LJ8MB3`, `P1A2B3C4D5`, `0412`, `123456` removed; `1PASSWORD`, `MP3`, `B2B`, `365`, `A1B2C` kept; `#0412`, `STORE 12`, `NO 7`, `NR 3` removed; running store numbers and then references on `WALGREENS STORE 1234` and `FOO STORE 0412` leaves `WALGREENS` and `FOO`.
  - Unit tests (`rule-trailing.test.ts`): `FOO AM DE` → `FOO`; `TANKSTELLE AM RING` unchanged; `BP` and `BP 0412` → `BP` with no processor; `CA` alone → empty with a processor; `SUPERMARKT NORD 0412` → `SUPERMARKT NORD`; `STUDIO 54` → `STUDIO`.
  - _Requirements: 3.8, 3.9, 3.10_

> **Batch 2 done:** every rule tested on its own; suite green.

---

## Batch 3: cleaning engine and the service list

- [ ] 8. Pass loop, context snapshot and residue (`clean.ts`)
  - Write `cleanDescription(description)`:
    - NFKC, lex, then run steps 1–8 in the design's order with `firstPass: true`;
    - snapshot the folded tokens after step 5 of pass 1 as `context`;
    - repeat on the space-joined raw output with `firstPass: false` and the recorded processor until the folded output stops changing; record `passes`;
    - build the Unidentified residue from the pass-1 lexemes: drop the spans removed for `prefix`, `card-number` and `date` and the gap lexeme after each, concatenate the folded text, collapse whitespace (`\s`, `\p{Z}`), trim.
  - Unit tests (`clean.test.ts`):
    - Cleaned names for every Req 3.12 row and every Req 7.1 description;
    - `POS 12/03 PURCHASE NETFLIX` → `NETFLIX`; `DEBIT CARD PURCHASE 12/03 APPLE.COM/BILL 866-712-7753 CA` records `apple` and cleans to empty;
    - `context` for `MICROSOFT 365 0412 WA` keeps `365`;
    - residues for every row of the design's residue table, and `APPLE.COM/BILL*12/03*CA` and `APPLE.COM/BILL*CA` give the same residue;
    - realistic descriptions finish in 2 passes.
  - Property test (`clean.property.test.ts`): **P6** (cleaning `joinTokens(cleaned, "raw")` again gives the same cleaned tokens, for arbitrary strings and for strings built from the noise lists).
  - _Requirements: 3.1–3.11, 3.12 (cleaned names), 6.2 (residue), 9.6_

- [ ] 9. Known service data (`known-services.ts`)
  - Write the 59 services from design "Known service data", in that order, with exactly the Req 4.2 ids, display names and categories and the design's variants. Deep-freeze the list, each service and each variant array.
  - Write `getKnownService(serviceId)` backed by a frozen `Map` built at module load.
  - Export `KNOWN_SERVICES` and `getKnownService` from `index.ts`.
  - Unit tests (`known-services.test.ts`): every data check in the design (count 59; unique ids matching `^[a-z0-9]+(-[a-z0-9]+)*$`; ids, display names and categories equal to the Req 4.2 table; at least two variants each, one equal to the folded display name; every variant text equals `joinTokens(lex(text), "folded")`; no variant text shared by two services; no variant token is a card prefix, a month or a 1–2 digit number; the listed services use `exact`; none of the Req 4.8 excluded tokens is a variant; `getKnownService` returns the frozen object or `undefined`; frozen objects reject writes).
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6 (exact for ambiguous names), 4.8 (excluded tokens), 7.2 (no `streaming`/`premium`/`musik`), 10.1 (bundled list), 10.4_

- [ ] 10. Variant matching (`match-known.ts`)
  - Build the read-only `containsByFirstToken` and `exactByText` indexes at module load.
  - Write `matchKnownService(context, cleaned)`: contains hits in both lists on whole-token sequences, the exact hit on the whole cleaned text, then the longest text, lowest service index, lowest variant index.
  - Unit tests (`match-known.test.ts`), on folded token lists:
    - whole-token matching (`apple` does not match `applebees`);
    - `max mustermann`, `calm waters spa`, `medium roast` give no match, while `max`, `calm`, `medium` alone match;
    - `amazon prime video` → `amazon-prime`, `amazon music` → `amazon-music`, `youtube premium` → `youtube-premium`, and `youtube` alone gives no match;
    - a hit found only in `cleaned` (`uber one` after `0412` was removed) counts;
    - ties between equal-length variants go to the earlier service.
  - _Requirements: 4.5, 4.6, 4.7_

> **Batch 3 done:** cleaning and matching tested separately; suite green.

---

## Batch 4: `normalizeMerchant` and its properties

- [ ] 11. Display and unidentified helpers (`display.ts`, `unidentified.ts`)
  - `slugify(foldedText)`: runs of `[^\p{L}\p{N}]` → `-`, trimmed.
  - `titleCase(rawToken)`: initial letters (first letter or digit, or after `-`) upper-cased, others lower-cased, leaving a character unchanged when upper-casing would turn it into several code points.
  - `unidentifiedKey(processor, residue)` and `unidentifiedDisplayName(processor)` as in the design.
  - Unit tests (`display.test.ts`): `JOE'S` → `Joe's`; `7-ELEVEN` → `7-Eleven`; `ßTRASSE` stays idempotent under `titleCase`; `CAFÉ` → `Café`; `slugify("joe's pizza")` → `joe-s-pizza`; `slugify("яндекс плюс")` → `яндекс-плюс`; `slugify("---")` → `""`.
  - Unit tests (`unidentified.test.ts`, helper cases): every processor's display name; no processor → `Unknown merchant`; an empty residue → `unidentified:none:-`.
  - _Requirements: 2.3, 5.2, 5.3, 6.2 (empty residue), 6.4_

- [ ] 12. `normalizeMerchant` (`normalize-merchant.ts`)
  - Implement the design's identity builder: `TypeError` for a non-string; clean; match; generic when the slug is non-empty; otherwise unidentified. The generic display name is the title-cased raw tokens joined with spaces, then NFC.
  - Export `normalizeMerchant` from `index.ts`.
  - Unit tests (`normalize-merchant.test.ts`):
    - every row of Req 3.12;
    - `CAFÉ MÜLLER`, `Cafe Muller`, `café müller` → `merchant:cafe-muller`; `CAFÉ MÜLLER 0412` → `Café Müller`; `ＣＡＦＥ` → `Cafe`;
    - `ЯНДЕКС ПЛЮС` keeps its Cyrillic letters in key and display name;
    - `PAYPAL *SPOTIFY` and `SPOTIFY P1A2B3C4D5` both → `spotify`, with processors `paypal` and `null`;
    - every row of the Req 4.8 tables, including Uber, Amazon, Prime Video, Xbox, PlayStation, Nintendo, EA and Kindle;
    - `APPLE.COM/BILL` and `GOOGLE *` alone → `unidentified`, not an Apple or Google service;
    - non-string input (`undefined`, `null`, `42`) throws `TypeError`.
  - Unit tests (`unidentified.test.ts`, end-to-end cases): every Req 6.1 example → `unidentified`; every row of the Req 6.3 table; `POS 01/12` → `unidentified:none:-`; the identity of an unidentified description never depends on anything but the string (the function has no other input).
  - Property tests (`normalize-merchant.property.test.ts`): **P1**, **P2**, **P3** (the `normalizeMerchant` half), **P4**, **P5** (arbitrary strings) and **P12**.
  - Property test (`known-services.property.test.ts`): **P8**.
  - _Requirements: 1.1–1.9, 2.2, 2.4, 2.5, 3.12, 4.8, 4.9, 4.11, 5.1–5.5, 6.1–6.5, 9.1, 9.2, 9.3, 9.5, 9.7_

- [ ] 13. Noise generators and the noise properties (`test-arbitraries.ts`)
  - Write `noiseArb`, `genericNameArb` and `unidentifiedArb` as described in design "Generators", built from the constants in `noise-lists.ts` and filtered against variant tokens.
  - Self-tests (`test-arbitraries.test.ts`): every generated reference token is removed by step 7 and is not a variant token; every generated generic name is `generic` when bare; every generated date passes the 1–31/1–12 check.
  - Property test (`match-known.property.test.ts`): **P7**.
  - Property tests (`normalize-merchant.property.test.ts`): **P9**, and extend **P5** to run on `noiseArb` × variants and `noiseArb` × generic names.
  - Property test (`unidentified.property.test.ts`): **P10**.
  - _Requirements: 5.4, 5.6, 6.3, 9.4, 9.5, 9.8, 9.9_

> **Batch 4 done:** `normalizeMerchant` complete with P1–P10 and P12; suite green.

---

## Batch 5: statement helper, samples, privacy and performance

- [ ] 14. `normalizeTransactions` (`normalize-transactions.ts`)
  - Implement the design's version: a memo local to the call, the four `Transaction` fields copied explicitly, `merchant` a fresh copy per element.
  - Export `normalizeTransactions` from `index.ts`.
  - Unit tests (`normalize-transactions.test.ts`): an empty array gives `[]`; debit, credit and zero rows with the same description get equal `merchant` values; a frozen input array of frozen transactions does not throw; an input object with an extra property gives an output without it; mutating one output's `merchant` leaves another element with the same description unchanged.
  - Property tests (`normalize-transactions.property.test.ts`): **P11**, and extend **P3** (in `normalize-merchant.property.test.ts`) to the `normalizeTransactions` half.
  - _Requirements: 8.1–8.6, 9.3_

- [ ] 15. Known-service fixtures, the EU sample and sample snapshots
  - Write `test-known-service-fixtures.ts`: for each of the 59 services, at least one realistic raw description with bank noise (e.g. `NETFLIX.COM 866-579-7172 CA`, `PAYPAL *DISNEYPLUS 4029357733`, `GOOGLE *YouTubePremium g.co/helppay#`, `MICROSOFT*XBOX GAME PASS 425-681-4800 WA`, `AMZN DIGITAL*KINDLE UNLIMITED`). Invented reference numbers only.
  - `known-services.test.ts`: every fixture maps to its `serviceId`, and every service has a fixture.
  - `eu-sample.test.ts`:
    - read `samples/eu-semicolon.csv` with `node:fs`, parse it with `parseStatement`, run `normalizeTransactions`, and compare each description with the Req 7.1 table;
    - exactly 7 distinct keys, and no `known` result;
    - `SEPA-LASTSCHRIFT SPOTIFY AB` → `spotify`; `KARTENZAHLUNG 03.01. NETFLIX` → `netflix`;
    - `RÜCKERSTATTUNG` and `RUCKERSTATTUNG` share a key, and `RUECKERSTATTUNG` has a different one; `STRAßE` and `STRASSE` share a key.
  - `samples.test.ts`: for each CSV in `samples/` (`us-signed.csv`, `uk-debit-credit.csv`, `eu-semicolon.csv`, `with-preamble.csv`), parse, normalize and snapshot the sorted list of distinct `{ key, displayName, source, serviceId, processor }`.
  - _Requirements: 4.10, 7.1–7.5_

- [ ] 16. Privacy and environment checks
  - `no-network.test.ts` in `src/normalize`: scan every non-test `.ts` file's syntax tree and fail on `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `document`, `window`, `navigator` or `localStorage`, naming the file, line and identifier. If the scanner in `src/parse/no-network.test.ts` is local to that file, move it to `src/test-no-network-scan.ts` and use it from both tests, keeping the parser's test passing unchanged. Include the self-tests: a fixture containing `fetch(` is reported; a comment and `prefetchAll` are not.
  - Add `localStorage` to the `no-restricted-globals` rule for `packages/core/src/**` in `eslint.config.js`, with the same privacy message.
  - `node-env.test.ts` in `src/normalize`: import `normalizeMerchant`, `normalizeTransactions`, `KNOWN_SERVICES` and `getKnownService` from the package entry (`../index.js`) under the Node environment and call each one; check that `window`, `document`, `navigator` and `localStorage` are undefined.
  - Extend `src/build.test.ts`: the plain-Node import of `dist/index.js` also calls `normalizeMerchant("NETFLIX.COM 866-579-7172 CA")` and expects key `netflix`.
  - _Requirements: 10.1, 10.2, 10.3, 10.5; privacy.md_

- [ ] 17. Performance (`performance.test.ts`)
  - Write `adversarialCorpus` in `test-arbitraries.ts`: every string listed in design "Generators", each exactly 10,000 characters, plus random-case copies and at least one nested phone/date alternation that needs several passes.
  - **P13**: after one warm-up call, each corpus entry and 100 random 10,000-character strings (`fc.string` and `fc.fullUnicodeString`) finish in under 250 ms, measured with `performance.now()`. The test name gives the slowest input's label and time on failure.
  - Assert that `cleanDescription` reports `passes` ≤ 3 for each realistic fixture from task 15, so a rule change that adds passes is noticed.
  - _Requirements: 9.10_

> **Batch 5 done:** feature complete; suite green.

---

- [ ] 18. Checkpoint: run the whole suite
  - From the repo root, run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. All must pass with no skipped or `.only` tests, and the statement-parser suite must be unchanged.
  - Check that `packages/core/dist` contains no test files, no `test-arbitraries`, `test-known-service-fixtures` or `test-no-network-scan` output and no `node:fs` import, and that `dist/index.js` exports `normalizeMerchant`, `normalizeTransactions`, `KNOWN_SERVICES` and `getKnownService` in plain Node (`build.test.ts` covers this).
  - Check that every property P1–P13 has a passing `it`/`test` whose name starts with its ID, and that `grep -rE 'console\.|toLocale|Intl\.|new Date|Date\.now' packages/core/src/normalize` finds nothing outside test files.
  - Check traceability: every acceptance criterion in `requirements.md` (1.1–1.9, 2.1–2.5, 3.1–3.12, 4.1–4.11, 5.1–5.6, 6.1–6.5, 7.1–7.5, 8.1–8.6, 9.1–9.10, 10.1–10.5) appears in at least one task's `_Requirements_` line above.
  - Stop and report results. Do not start other specs.
  - _Requirements: all (traceability)_

---

## Property → task map

| Property | Task |
| --- | --- |
| P1 never throws | 12 |
| P2 output shape | 12 |
| P3 deterministic | 12 (`normalizeMerchant`), 14 (`normalizeTransactions`) |
| P4 case-insensitive | 12 |
| P5 idempotent | 12 (arbitrary strings), 13 (noisy variants and names) |
| P6 cleanup fixed point | 8 |
| P7 known noise-insensitivity | 13 |
| P8 list invariant | 12 |
| P9 generic noise-insensitivity | 13 |
| P10 unidentified keys | 13 |
| P11 pass-through | 14 |
| P12 generic keys never merge different names | 12 |
| P13 bounded time | 17 |
