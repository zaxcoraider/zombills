# Requirements Document

## Introduction

When the user buries a subscription, the tombstone today ends with "Cancel it with the provider to stop the charges." (`apps/web/src/slice/graveyard/tombstone.tsx`). Burying only records the user's decision; the charges stop only when the user cancels with the provider. This spec replaces that line with a cancel helper that tells the user how to do it.

The cancel helper has three parts:

- **Cancel database** (`packages/core/src/cancel`, exported from `@zombills/core`, to be shared later with the Reaper). Pure data keyed on the merchant normalizer's `serviceId`. For each Known service it holds the provider's official cancel, manage-subscription or help page (`https` only, on the provider's own domain), up to 3 short steps, whether the subscription may be billed through Apple or Google instead, and the date a person last checked the entry (`null` until a person has checked it). A URL differs by region (US, UK, EU) only where the provider really uses a different page; few entries need this (for example `amazon-prime`). Services with no reliable page are listed as email-only.
- **Cancellation email generator** (same module). A pure, deterministic function that writes a subject and body asking the provider to cancel and confirm in writing. It names the service, the plan amount and currency, and the cadence. The user's name and account email are placeholders the user fills in. It is offered for every buried subscription and is the main path for email-only services, Generic merchants and Unidentified merchants.
- **Cancel helper UI** (`apps/web`). Under the tombstone in the burial flow and in the graveyard, it shows the cancel link (if any), the steps, the app-store note and the email with a Copy button and a `mailto:` link.

The data rules (Requirement 6) are checked by offline tests. No test, build step or runtime code opens a cancel URL. A person checks each URL by hand and records the date in `lastChecked`. Tasks run by Kiro always write `lastChecked: null`; only the last task of this spec, a human step, opens each URL and sets the dates (Requirement 6.12).

Privacy (`privacy.md`): the module has no network access and no storage. The app never fetches a cancel URL. It only renders links that the user may click, which open in a new tab with `rel="noopener noreferrer"`. The email text exists only in the page, and it reaches the clipboard or the user's mail client only when the user presses Copy or the `mailto:` link. Nothing is sent by the app. The `mailto:` link hands the text to whatever mail handler the browser has registered, which may be a webmail site, so the panel says what the link does before the user clicks (Requirement 7.7).

This spec also:

- adds `serviceId` to the graveyard-ui Answer record, so a tombstone can find its Cancel entry (Requirement 9);
- amends the vertical-slice and graveyard-ui tests that check the old tombstone line and the demo path (Requirement 10).

Out of scope for this spec:

- Logging into any service, cancelling on the user's behalf, or sending any email. The app only prepares text and links.
- The Reaper app. It will import the same module later; this spec defines no Reaper behaviour.
- Checking cancel URLs over the network, in CI or at runtime. Link checking stays a manual task recorded in `lastChecked`.
- Provider email addresses. The database holds none (a wrong or stale address would send the user's account details to a stranger), so every `mailto:` link has no recipient.
- Guessing the provider of a Generic or Unidentified merchant, or pointing an Unidentified Apple or Google charge to the store's subscription page. Those merchants get the email only.
- Translating the email or the steps. All text is English.
- Persisting anything. Tombstones stay in memory as graveyard-ui defines; the future `graveyard-memory` spec decides what is stored.

---

## Glossary

- **Cancel module**: The new module in `packages/core/src/cancel`, exported from `@zombills/core`.
- **Known service id**: A `serviceId` of an element of `KNOWN_SERVICES` in `packages/core/src/normalize/known-services.ts`. There are 59 today. The set is read from `KNOWN_SERVICES` at test time, never copied into the cancel module, so a new Known service fails the tests until it is added to the Cancel database.
- **Known display name**: The `displayName` of the Known service with a given Known service id, for example `"Disney+"` for `disney-plus`.
- **Cancel entry**: One record of the Cancel database for one Known service id (Requirement 1.2).
- **Email-only id**: A Known service id with no Cancel entry, listed in `EMAIL_ONLY_SERVICE_IDS` with a reason (Requirement 1.4).
- **Cancel database**: `CANCEL_ENTRIES` and `EMAIL_ONLY_SERVICE_IDS` together.
- **Region**: `"US"`, `"UK"` or `"EU"`. An `"EU"` regional URL is set only when the provider uses one page for the whole EU; a provider with per-country pages gets no `"EU"` URL, so EUR statements use the default URL.
- **Statement region**: The Region the helper uses for one subscription, derived only from its `currency`: `"USD"` → `"US"`, `"GBP"` → `"UK"`, `"EUR"` → `"EU"`, any other currency → no Region.
- **Provider domain**: A lower-case DNS host name in a Cancel entry's `providerDomains`, owned by the provider or its parent company (for example `netflix.com`, or `amazon.com` and `amazon.co.uk` for Amazon Prime). A host **is on** a Provider domain list when it equals one of them or ends with `"." + ` one of them.
- **Tracking parameter**: A URL query parameter whose name, compared case-insensitively, starts with `utm_` or is one of `gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `msclkid`, `yclid`, `igshid`, `twclid`, `ttclid`, `li_fat_id`, `mc_cid`, `mc_eid`, `_ga`, `_gl`, `_hsenc`, `_hsmi`, `ref`, `ref_`, `referrer`, `source`, `src`, `campaign`, `cmp`, `cid`, `trk`, `affiliate`, `aff_id`, `partner`, `promo`.
- **App-store links**: The two official pages where a user manages subscriptions billed by a store: Apple and Google, held in `APP_STORE_LINKS` (Requirement 1.6).
- **Email input**: The argument of `cancellationEmail` (Requirement 3.1).
- **Name placeholder** / **Email placeholder**: The literal strings `[Your name]` and `[Your account email]`.
- **Answer record**, **Display name**, **Page**, **Current record**, **Ended subscription**: As defined in the graveyard-ui spec Glossary.
- **Burial stage**: The `[data-burial-stage]` container rendered by `apps/web/src/slice/graveyard/burial-stage.tsx`, where graveyard-ui's Burial sequence runs and the stage tombstone appears.
- **Graveyard view**: The view rendered by `apps/web/src/slice/graveyard/graveyard-view.tsx` (graveyard-ui Requirement 7).
- **Ended tombstone**: A tombstone whose Answer record is a Current record and whose subscription is an Ended subscription (graveyard-ui Requirement 9.6). The UI knows this as `haunt.byId.get(record.id)?.status === "ended"` (`apps/web/src/slice/logic/haunt-view.ts`). An Earlier record is never an Ended tombstone, because the current outcome says nothing about it.
- **Helper panel**: The cancel helper UI for one buried subscription (Requirement 7).
- **Source**: The `source` of a Subscription (`"known"`, `"generic"` or `"unidentified"`), detector Requirement 1.6.

---

## Requirements

### Requirement 1: Cancel database shape and public API

**User Story:** As the web UI and later the Reaper, I want one typed, frozen table of cancel instructions keyed on the normalizer's `serviceId`, so that both apps give the same advice for the same service.

#### Acceptance Criteria

1. THE Cancel module SHALL export from `@zombills/core` the constants `CANCEL_ENTRIES`, `EMAIL_ONLY_SERVICE_IDS` and `APP_STORE_LINKS`, the functions `getCancelHelp`, `statementRegion`, `cancellationEmail`, `mailtoHref` and `validateCancelDatabase`, and the types `CancelRegion`, `CancelLinkKind`, `CancelEntry`, `EmailOnlyService`, `CancelHelp`, `EmailInput`, `CancellationEmail`, `CancelDataIssue`, `CancelDataRule` and `ValidateCancelOptions`.
2. THE Cancel module SHALL define the database types as:

   ```ts
   type CancelRegion = "US" | "UK" | "EU";
   type CancelLinkKind = "cancel" | "manage" | "help"; // what the page is, for the link text

   type CancelEntry = {
     serviceId: string;                         // a Known service id
     providerDomains: readonly string[];        // 1 or more Provider domains
     url: string;                               // default page, https
     kind: CancelLinkKind;
     regionalUrls: Readonly<Partial<Record<CancelRegion, string>>>; // usually {}; only where the page really differs
     steps: readonly string[];                  // 1 to 3 short plain-text steps
     appStoreMayApply: boolean;                 // may be billed through Apple or Google instead
     lastChecked: string | null;                // yyyy-mm-dd, the day a person opened the URLs; null = unverified
   };

   type EmailOnlyService = {
     serviceId: string;                         // a Known service id
     reason: string;                            // why there is no link, for reviewers; never shown
     lastChecked: string | null;                // yyyy-mm-dd; null = unverified
   };
   ```

3. `CANCEL_ENTRIES` SHALL be a `readonly CancelEntry[]` sorted by `serviceId` in code-unit order. `EMAIL_ONLY_SERVICE_IDS` SHALL be a `readonly EmailOnlyService[]` sorted the same way.
4. Every Known service id SHALL appear exactly once in exactly one of `CANCEL_ENTRIES` and `EMAIL_ONLY_SERVICE_IDS`, and no other id SHALL appear in either (Requirement 6.1). An id SHALL be email-only only when the person checking it found no official page that a signed-in user can follow to cancel or manage the subscription (for example, a service that cancels only in person, by post or by phone). Being hard to find is not a reason. Until a person has checked an id (Requirement 6.12), its `lastChecked` SHALL be `null`; no task run by an agent SHALL write a date.
5. Each step SHALL be plain text written for a reader in a hurry: one instruction per step, starting with a verb, naming the buttons or menu items as the provider labels them, with no URL, no HTML or Markdown, no spooky wording and no exclamation mark (Requirement 6.5). Example for `netflix`: `"Sign in and open Account."`, `"Choose Cancel Membership."`, `"Confirm with Finish Cancellation."`.
6. `APP_STORE_LINKS` SHALL be `{ apple: { label: "Apple subscriptions", url, providerDomains }, google: { label: "Google Play subscriptions", url, providerDomains } }`, pointing at Apple's and Google's own subscription management or help pages and following the same URL rules as Cancel entries (Requirement 6.2, 6.3).
7. Every exported constant and every object, array and record reachable from it SHALL be frozen (`Object.isFrozen`), so neither app can change the shared data at runtime.
8. THE Cancel database SHALL be data only: it SHALL NOT be built from, or fetched from, any external source at build time or runtime.

---

### Requirement 2: Looking up help for a subscription

**User Story:** As the web UI, I want one call that tells me what help a buried subscription gets, already resolved for the statement's region, so that the tombstone needs no lookup logic of its own.

#### Acceptance Criteria

1. THE Cancel module SHALL define:

   ```ts
   type CancelHelp =
     | {
         kind: "link";
         serviceId: string;
         url: string;              // the regional URL for the Statement region, else the default url
         linkKind: CancelLinkKind;
         host: string;             // host name of url, lower case, without "www."
         steps: readonly string[];
         appStoreMayApply: boolean;
         lastChecked: string | null; // null when no person has checked the entry yet
       }
     | { kind: "email-only"; serviceId: string | null };
   ```

   and `getCancelHelp(serviceId: string | null, currency: string): CancelHelp`.
2. THE function `statementRegion(currency: string): CancelRegion | null` SHALL return the Statement region of `currency` (Glossary), comparing the exact string, so `"usd"` and `" USD"` give `null`. `"EUR"` maps to `"EU"` for every euro country; an entry has an `"EU"` regional URL only when that page is shared EU-wide (Glossary "Region"), so a French user paying in EUR is never sent to a single country's site such as `amazon.de`.
3. WHEN `serviceId` has a Cancel entry, THE `getCancelHelp` function SHALL return `kind: "link"` with the entry's `steps`, `appStoreMayApply`, `lastChecked` and `kind` (as `linkKind`), and `url` = `regionalUrls[statementRegion(currency)]` when that Region has a regional URL, else the entry's `url`.
4. WHEN `serviceId` is an Email-only id, is `null`, or is any other string (including `""`, an unknown id, or an id differing only in case or whitespace from a Known service id), THE `getCancelHelp` function SHALL return `{ kind: "email-only", serviceId }` with the given value.
   The lookup SHALL use a `Map` built from `CANCEL_ENTRIES`, never a plain object or `in`/property access, so inherited keys such as `"constructor"`, `"__proto__"`, `"toString"` and `"hasOwnProperty"` give `"email-only"`.
5. THE `getCancelHelp` function SHALL depend only on its two arguments and the frozen data. It SHALL NOT throw for any `string | null` serviceId and any string currency, and SHALL return `{ kind: "email-only", serviceId: null }` when `serviceId` is neither a string nor `null`.
6. THE UI SHALL call `getCancelHelp` with the Answer record's `serviceId` (Requirement 9) and `currency`. A Subscription whose Source is `"generic"` or `"unidentified"` has `serviceId: null` (detector Requirement 1.6), so it always gets `"email-only"`.
7. Examples the implementation SHALL satisfy (URLs stand for whatever the data holds):

   | Call | Result |
   | --- | --- |
   | `getCancelHelp("netflix", "USD")` | `kind: "link"`, `serviceId: "netflix"`, the Netflix entry's US URL if it has one, else its default URL |
   | `getCancelHelp("netflix", "JPY")` | `kind: "link"` with the default URL |
   | `getCancelHelp(null, "USD")` | `{ kind: "email-only", serviceId: null }` |
   | `getCancelHelp("Netflix", "USD")` | `{ kind: "email-only", serviceId: "Netflix" }` |
   | `getCancelHelp("merchant:riverside-gym", "USD")` | `{ kind: "email-only", serviceId: "merchant:riverside-gym" }` |
   | `getCancelHelp("constructor", "USD")` | `{ kind: "email-only", serviceId: "constructor" }` |
   | `getCancelHelp("__proto__", "USD")` | `{ kind: "email-only", serviceId: "__proto__" }` |

---

### Requirement 3: Cancellation email generator

**User Story:** As a user who buried a subscription, I want a ready-to-send cancellation email that names the service and what I pay, so that I can cancel any subscription in a minute even when there is no cancel page.

#### Acceptance Criteria

1. THE Cancel module SHALL define:

   ```ts
   type EmailInput = {
     serviceName: string;    // Known display name, or the record's merchant (Criterion 9)
     amountText: string;     // currentAmountCents formatted by the caller, e.g. "$15.49"
     currency: string;       // ISO 4217 code, e.g. "USD"
     cadence: Cadence;       // "weekly" | "monthly" | "yearly"
     cadenceAssumed: boolean;
   };
   type CancellationEmail = { subject: string; body: string };
   ```

   and `cancellationEmail(input: EmailInput): CancellationEmail`. The amount comes in as text because money is formatted only in the UI layer (`money.md`); the web passes the same `formatMoney(currentAmountCents, currency, locale)` text the tombstone shows, and the Reaper will pass its own.
2. THE generator SHALL clean `serviceName` and `amountText` before use: first replace every lone surrogate with U+FFFD (as `String.prototype.toWellFormed` does); then replace every run of whitespace, control characters (U+0000–U+001F, U+007F–U+009F), line or paragraph separators (U+2028, U+2029) and format characters (Unicode general category `Cf`, which includes U+00AD, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069 and U+FEFF) with one space, trim, and cut to the first 80 code points (never splitting a surrogate pair), trimming again after the cut. WHEN the cleaned `serviceName` is empty, `my N subscription` SHALL read `my subscription` in the subject and body. A `currency` that is not exactly 3 upper-case ASCII letters SHALL be treated as absent.
3. THE generator SHALL return, with `N` = cleaned `serviceName`, `A` = cleaned `amountText`, `C` = `currency`, and `\n` line breaks:

   - `subject`: `Please cancel my N subscription`
   - `body`, line by line:

     ```text
     Hello,

     Please cancel my N subscription and stop all future payments.

     Name on the account: [Your name]
     Account email: [Your account email]

     <amount line>

     Please confirm in writing that the subscription is cancelled, the date it ends, and that no further payments will be taken.

     Thank you,
     [Your name]
     ```

4. The `<amount line>` SHALL be, with ` (C)` left out when `currency` is absent:
   - when `cadenceAssumed` is `false`: `I am currently charged A (C) every week.`, `every month.` or `every year.` for `"weekly"`, `"monthly"` or `"yearly"`;
   - when `cadenceAssumed` is `true`: `My most recent charge was A (C).` (the cadence is a guess from one charge, graveyard-ui Requirement 5.6, so the email does not state it);
   - WHEN `A` is empty, the amount line and the blank line after it SHALL be left out.
5. THE body SHALL contain the Name placeholder twice and the Email placeholder once, exactly as written, and SHALL NOT fill them from any input. The generator has no parameter for a name, an email address, a card number, an account number, a payment reference, a date or a statement description, and SHALL ignore any extra property on `input`.
6. THE generator SHALL be deterministic: deeply equal inputs SHALL give equal output, with no clock, randomness, locale or environment dependence.
7. THE generator SHALL NOT throw for any `EmailInput`. WHEN `cadence` is not one of the three values, it SHALL use the `cadenceAssumed: true` amount line.
8. THE Cancel module SHALL export `mailtoHref(email: CancellationEmail): string`, returning `"mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(bodyWithCrlf)`, where `bodyWithCrlf` is the body with every `\n` replaced by `\r\n` (RFC 6068). The href SHALL have no recipient, because the database holds no addresses. `mailtoHref` SHALL NOT throw for any `CancellationEmail`, including one built by hand with lone surrogates: it SHALL replace each lone surrogate in `subject` and `body` with U+FFFD before encoding, since `encodeURIComponent` throws `URIError` on them.
9. THE UI SHALL build the Email input from the Answer record only: `serviceName` = the Known display name WHEN the record's `serviceId` is a Known service id, else the record's `merchant`; `amountText` = the formatted `currentAmountCents` in the record's `currency`; `currency`, `cadence` and `cadenceAssumed` from the record. It SHALL NOT use the Display name's long form or " (2)" suffix, which exist only to tell cards apart on the Page.
10. Examples the implementation SHALL satisfy:

    | Input | Amount line | Subject |
    | --- | --- | --- |
    | `"Netflix"`, `"$17.99"`, `"USD"`, monthly, not assumed | `I am currently charged $17.99 (USD) every month.` | `Please cancel my Netflix subscription` |
    | `"Riverside Gym Membership"`, `"$29.00"`, `"USD"`, monthly | `I am currently charged $29.00 (USD) every month.` | `Please cancel my Riverside Gym Membership subscription` |
    | `"The Economist"`, `"£179.00"`, `"GBP"`, yearly, assumed | `My most recent charge was £179.00 (GBP).` | `Please cancel my The Economist subscription` |
    | `"  Spotify\n\tPremium "`, `"€10.99"`, `"EUR"`, weekly | `I am currently charged €10.99 (EUR) every week.` | `Please cancel my Spotify Premium subscription` |
    | `""`, `""`, `"usd"`, monthly | (left out) | `Please cancel my subscription` |
    | `"Net\u200Bflix\uD800"`, `"$1.00"`, `"USD"`, monthly | `I am currently charged $1.00 (USD) every month.` | `Please cancel my Net flix\uFFFD subscription` |

---

### Requirement 4: Pure, offline and private

**User Story:** As the Zombills privacy contract, I want the cancel module to be inert data and pure functions, so that helping the user cancel never sends anything about their statement anywhere.

#### Acceptance Criteria

1. THE Cancel module SHALL NOT call any network API (`fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`), access any DOM, browser-global or storage API (`document`, `window`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`, cookies), read the clock (`Date.now()`, `new Date()` with no arguments, `performance.now()`), use randomness (`Math.random()`, `crypto.randomUUID()`) or call `console` methods.
2. THE Cancel module SHALL keep no mutable module-level state. Every function SHALL return deeply equal results for deeply equal arguments and SHALL NOT mutate its arguments.
3. A static analysis test SHALL scan every non-test source file in `packages/core/src/cancel` with the shared scan in `packages/core/src/test-no-network-scan.ts` (`findForbiddenReferences` and `findClockAndRandomReferences`), plus a check for `console`, `sessionStorage`, `indexedDB` and `document.cookie` that, like `findClockAndRandomReferences`, looks only at identifiers and property accesses, never at string literals or comments, so step and `reason` text such as `"On your console, open Settings."` passes. The shared `findForbiddenReferences` is used unchanged and still reads string literals, so step and `reason` text SHALL NOT contain its words (`fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `document`, `window`, `navigator`, `localStorage`) as whole words; write "browser tab", not "browser window". It SHALL fail with an error naming the file, line and offending API, as the classifier's test does (classifier Requirement 7.4).
4. WHEN the Cancel module is imported in a Node.js Vitest environment with no browser polyfills, it SHALL load and run every exported function without a runtime error caused by a missing browser global.
5. No test, script, build step or CI job SHALL request a cancel URL. Requirement 6 is checked only on the data in the repository.
6. THE web app SHALL NOT request, prefetch, preconnect to or embed any cancel URL or App-store link: no `fetch`, `<link rel="prefetch|preconnect|dns-prefetch">`, `<iframe>`, `<img>` or favicon from a provider host. Provider pages open only when the user activates a link, in a new tab, with `rel="noopener noreferrer"` so the provider gets no referrer and no handle on the Page.
7. THE email text and `mailto:` href SHALL exist only in the DOM of the Page. THE web app SHALL write them to the clipboard only when the user activates Copy, SHALL NOT write them or any part of them to `localStorage`, `sessionStorage`, IndexedDB, the Cache API, cookies or the Page URL, and SHALL NOT log them. The `Open in my email app` link SHALL carry the hint of Requirement 7.7, because the browser may hand the `mailto:` text to a webmail site. Vertical-slice Requirement 7.3 and graveyard-ui Requirement 15 keep holding unchanged.

---

### Requirement 5: Data validator

**User Story:** As a maintainer editing the cancel data by hand, I want one function that lists every rule a change breaks, so that a bad URL or a missing service fails the tests with a clear message instead of reaching users.

#### Acceptance Criteria

1. THE Cancel module SHALL export `validateCancelDatabase(entries: readonly CancelEntry[], emailOnly: readonly EmailOnlyService[], knownServiceIds: readonly string[], appStoreLinks: typeof APP_STORE_LINKS, options?: ValidateCancelOptions): CancelDataIssue[]` where:

   ```ts
   type CancelDataRule =
     | "missing-service" | "unknown-service" | "duplicate-id" | "listed-twice" | "unsorted"
     | "https-only" | "url-form" | "provider-domain" | "domain-form" | "tracking-param"
     | "steps-count" | "step-text" | "region-key" | "region-duplicate" | "date-form"
     | "field-type" | "unverified";              // exactly the rule names of Requirement 6

   type ValidateCancelOptions = { requireVerified?: boolean }; // default false

   type CancelDataIssue = {
     serviceId: string | null;   // null for an App-store link or a whole-list issue
     field: string;              // e.g. "url", "regionalUrls.UK", "steps[2]", "lastChecked"
     rule: CancelDataRule;       // the Requirement 6 rule broken, e.g. "https-only"
     message: string;            // plain sentence naming the value
   };
   ```

   `appStoreLinks` is required: callers pass `APP_STORE_LINKS` or a test fixture, and the validator never falls back to the frozen constant.

2. THE validator SHALL return one issue for every broken rule of Requirement 6 on every field, in a deterministic order (by list, then index, then field, then rule), and an empty array when the data follows every rule.
3. THE validator SHALL be pure and SHALL NOT throw for any argument, including values that do not match the declared types (for example a `null` entry, a `url` that is not a string, or a missing `steps`); each such value SHALL produce an issue.
4. THE validator SHALL check URLs with the WHATWG `URL` parser, which is available in Node.js and browsers without network access, and SHALL NOT resolve host names. Because the core typecheck has no DOM lib (`tsconfig.base.json` `"lib": ["ES2022"]`, `packages/core/tsconfig.json` `"types": []`), the Cancel module SHALL declare `URL` itself in one minimal ambient declaration inside `packages/core/src/cancel` (a module-scoped `declare const URL` in the one file that calls it, for example `url-parts.ts`; a global `.d.ts` declaration clashes with `@types/node` under the test config), declaring only the constructor and the read-only string properties the validator reads (`protocol`, `username`, `password`, `port`, `hostname`, `search`, `href`; query parameter names are split from `search`, so no `URLSearchParams` is declared). `"DOM"` SHALL NOT be added to any core `lib`, and no other browser global SHALL be declared.
5. A unit test SHALL call `validateCancelDatabase(CANCEL_ENTRIES, EMAIL_ONLY_SERVICE_IDS, KNOWN_SERVICES.map((s) => s.serviceId), APP_STORE_LINKS)` without options and SHALL fail, printing every issue's `message`, unless the result is empty. Entries with `lastChecked: null` pass this test.
6. WHEN `options.requireVerified` is `true`, THE validator SHALL also report one `unverified` issue (field `lastChecked`) for every Cancel entry and Email-only id whose `lastChecked` is `null`. Without that option it SHALL report no `unverified` issue. A second unit test, calling the validator as in Criterion 5 with `{ requireVerified: true }`, SHALL be added only by the human step of Requirement 6.12.

---

### Requirement 6: Data quality rules

**User Story:** As a user about to click a link from a site that has just read my bank statement, I want every link to go straight to the provider's own page with nothing tracking me, so that the helper cannot send me to a phishing page or a referral funnel.

#### Acceptance Criteria

1. *Coverage* (`missing-service`, `unknown-service`, `duplicate-id`, `listed-twice`, `unsorted`): every Known service id SHALL appear in exactly one of `entries` and `emailOnly`; no id outside the Known service ids SHALL appear in either; no id SHALL appear twice in one list or once in each; and each list SHALL be sorted by `serviceId` in code-unit order.
2. *URL form* (`https-only`, `url-form`): every URL (`url`, each value of `regionalUrls`, each App-store link `url`) SHALL be a string that the WHATWG `URL` parser accepts, whose `protocol` is `https:`, with no username or password, no explicit port, a host name that is not an IP address, `localhost` or a single label, and whose `href` equals the string as written (so the stored text is already in canonical form, without hidden whitespace or encoded tricks).
3. *Provider host* (`provider-domain`, `domain-form`): every URL's host name SHALL be on the owning record's Provider domain list (Glossary). Each Provider domain SHALL be a lower-case host name of 2 or more labels with only `a-z`, `0-9`, `-` and `.`, SHALL NOT start with `www.` (because `host` drops `www.`, Requirement 2.1), SHALL NOT be a domain on the validator's deny list (at least `co.uk`, `com.au`, `github.io`, `netlify.app`, `vercel.app`, `pages.dev`, `web.app`, `firebaseapp.com`, `herokuapp.com`, `blogspot.com`, `bit.ly`, `t.co`, `goo.gl`, `tinyurl.com`, `lnkd.in`), and SHALL appear at most once in its list. The validator does not consult the Public Suffix List; a public suffix or shared host that is not on the deny list is caught by the reviewer of Criterion 11.
4. *No tracking* (`tracking-param`): no URL SHALL have a Tracking parameter (Glossary) in its query string, comparing each parameter name after percent-decoding it (a name that fails to decode is a `url-form` issue). A query parameter that is not a Tracking parameter is allowed only when the page needs it (for example a help article id). A fragment is allowed.
5. *Steps* (`steps-count`, `step-text`): every Cancel entry SHALL have 1 to 3 steps. Each step SHALL be a string of 3 to 120 characters after trimming, equal to its trimmed form, with no line break, no `<` or `>`, no `http://`, `https://` or `www.`, no `!`, ending with `.`.
6. *Region* (`region-key`, `region-duplicate`): the keys of `regionalUrls` SHALL be a subset of `"US"`, `"UK"` and `"EU"`, and no regional URL SHALL equal the entry's `url` or another regional URL of the same entry, so a regional URL exists only where the page really differs. Most entries SHALL have `regionalUrls: {}`; an `"EU"` key is allowed only for a page shared EU-wide (Glossary "Region").
7. *Dates* (`date-form`): every `lastChecked` (Cancel entries and Email-only ids) SHALL be `null` or a string `yyyy-mm-dd` naming a real calendar date in the proleptic Gregorian calendar (so `2026-02-29` and `2026-13-01` fail and `2028-02-29` passes), checked by integer arithmetic on the digits, not by `Date` parsing, and SHALL NOT be before `2025-01-01`.
8. The unit tests of Requirement 5.5 and 5.6 SHALL also fail when any non-null `lastChecked` is later than the UTC date on which the test runs plus one day, so a person ahead of UTC (for example in IST) can record the local date of their check. This one check reads the clock in the test file, never in the Cancel module.
9. *Other fields* (`field-type`): `kind` SHALL be one of the three CancelLinkKind values; `appStoreMayApply` SHALL be a boolean; `reason` SHALL be a non-empty string; `providerDomains` SHALL be a non-empty array.
10. Rules 2 to 4 SHALL hold for `APP_STORE_LINKS`, whose Provider domains SHALL be Apple's and Google's own domains (for example `apple.com`, `google.com`).
11. THE validator SHALL know nothing about which company owns which domain. Whether `providerDomains` really belong to the provider is checked by the person who sets `lastChecked`, and a reviewer of the change SHALL see every domain in the diff, since the data is plain text in one file.
12. *Verification* (`unverified`, reported only with `requireVerified: true`, Requirement 5.6): `lastChecked` records that a person opened the URL, so it SHALL be set only by the last task of this spec's `tasks.md`, which SHALL be marked as a human step (done by a person, or by Claude Code driving a real browser, never by a Kiro task agent). That step SHALL open every Cancel entry URL, regional URL and App-store link, confirm the page and the steps, fix any entry that is wrong, set each `lastChecked` to the date it was opened, and add the `requireVerified: true` test of Requirement 5.6. Every earlier task SHALL write `lastChecked: null`. Exception: the `requireVerified: true` test SHALL list by name the ids whose URLs could not be opened from the checker's network (a US-only geo-block or a bot wall), with the reason for each in `link-verification-2026-11-16.md`, and SHALL expect exactly those ids as `unverified` issues. Every other entry SHALL be verified. The Helper panel shows no `Link checked` line for a listed id (Requirement 7.5).

---

### Requirement 7: Helper panel on the tombstone

**User Story:** As a user who just buried a subscription, I want the way to cancel it right under its tombstone, so that I finish the job while I still remember to.

#### Acceptance Criteria

1. THE Tombstone SHALL no longer show "Cancel it with the provider to stop the charges.". In its place, inside the stone, it SHALL show `Still feeding until you cancel.` in the same type size, so the stone keeps saying that burying alone stops nothing. WHEN the tombstone is an Ended tombstone (Glossary), it SHALL show `It has stopped charging.` instead, because the statement shows the charges have stopped. THE UI SHALL pass this to `Tombstone` as a boolean prop computed from `haunt.byId.get(record.id)?.status === "ended"`; the stage tombstone is never an Ended tombstone, because only Risen subscriptions are buried on the Burial stage.
2. THE Burial stage SHALL show the Helper panel directly below the stage tombstone once the tombstone is shown (stage `"buried"`). It SHALL be outside the stone art, in normal document flow, so its text never overlaps the stone, the Ground or the Burial mound at any width.
3. THE Graveyard view SHALL give every tombstone that is not an Ended tombstone a disclosure button `How to cancel` with `aria-expanded` and `aria-controls`, and an accessible name `How to cancel <Display name>`, placed with the tombstone's other actions. The panel SHALL start collapsed and SHALL open and close on Enter, Space or click without moving focus. An Ended tombstone SHALL have no `How to cancel` button and no Helper panel.
4. THE Helper panel SHALL be a `section` labelled by its heading, whose visible text is `Seal the grave` and whose `aria-label` is `Seal the grave: <Display name>`, so each panel's accessible region name is `Seal the grave: <Display name>` and is distinct when several panels are mounted. The heading is followed by the plain line `Cancel <Display name> with the provider. Burying it here does not stop the payments.`.
5. WHEN `getCancelHelp` returns `kind: "link"`, THE Helper panel SHALL show, in this order:
   - a link whose text is `Open the <Known display name> cancel page`, `manage page` or `help page` for `linkKind` `"cancel"`, `"manage"` or `"help"`, followed by the visible host in parentheses (for example `(netflix.com)`); with `href` = `url`, `target="_blank"` and `rel="noopener noreferrer"`;
   - the steps as an ordered list (`ol`), each step's text exactly as stored;
   - WHEN `appStoreMayApply` is `true`, the note `If you pay through the App Store or Google Play, cancel there instead:` followed by both App-store links, each with its `label` as text and the same `target` and `rel`;
   - WHEN `lastChecked` is not `null`, the line `Link checked <Month yyyy>.`, formatting `lastChecked` as month and year in the Page locale and UTC; WHEN it is `null`, no such line;
   - the email block of Criterion 7, introduced by `Or ask them in writing:`.
6. WHEN `getCancelHelp` returns `kind: "email-only"`, THE Helper panel SHALL show no link, steps or app-store note, and SHALL introduce the email block with `No cancel page on file. Send them this instead:`.
7. The email block SHALL show the subject and body of `cancellationEmail` (Requirement 3.9) as read-only text that keeps its line breaks and can be selected, with a note `Replace the words in [brackets] before you send it.`, a `Copy email` button, and a link `Open in my email app` with `href` = `mailtoHref(email)` (no `target`), followed directly by the plain hint `Opens your email app with this text filled in.`. Copy SHALL put `subject + "\n\n" + body` on the clipboard. Accessible names follow Requirement 8.5.
8. All instructions, steps, links and notes SHALL be plain words (`spooky-design.md` tone rules: short sentences, no exclamation marks, no usage claims). Only the heading `Seal the grave` and the stone line of Criterion 1 use the undertaker voice. The panel SHALL use the design tokens of `spooky-design.md`, SHALL use Framer Motion for any motion, and SHALL show no service logo.
9. THE Helper panel SHALL build everything from the Answer record and the Cancel module. It SHALL NOT read the Subscription, its charges, descriptions, dates or evidence.
10. Examples (Sample "US bank, signed amounts"):
    - Burying Netflix shows `Open the Netflix … page (<host>)` with an `https` href on a Netflix Provider domain, the Netflix steps, and an email whose subject is `Please cancel my Netflix subscription` and whose amount line is `I am currently charged $17.99 (USD) every month.`.
    - Burying Riverside Gym Membership (Source `"generic"`) shows `No cancel page on file. Send them this instead:` and an email naming `Riverside Gym Membership` whose amount line is `I am currently charged $29.00 (USD) every month.`.
    - Burying Netflix, then loading a statement in which Netflix is an Ended subscription, shows its Graveyard view tombstone with `It has stopped charging.`, no `Still feeding until you cancel.`, and no `How to cancel Netflix` button.

---

### Requirement 8: Copy, keyboard and small screens

**User Story:** As a keyboard, screen-reader or phone user, I want the cancel helper to work the same way for me, so that I can cancel without a mouse or a wide screen.

#### Acceptance Criteria

1. Every link and button in the Helper panel SHALL be reachable with Tab in reading order (heading line, cancel link, App-store links, Copy, email-app link) and SHALL show the `--moss` focus ring of `spooky-design.md`. No element in the panel SHALL have a positive `tabindex`.
2. THE Burial stage SHALL keep moving focus to the tombstone when it rises (graveyard-ui focus rules). The Helper panel SHALL come next in tab order and SHALL NOT take focus by itself. THE panel SHALL sit between the stage tombstone and `Next` (or `Visit the graveyard`) in both DOM and tab order, on purpose: the moment after burying is when the user should cancel, so a keyboard user meets the cancel link before moving on, and reaches `Next` after at most six panel controls. No skip link is added (graveyard-ui note: Requirement 9.2).
3. WHEN the user activates Copy and `navigator.clipboard.writeText` resolves, THE Page SHALL clear the Page's existing `role="status"` live region and then, in a later task (for example the next animation frame), write `Email for <Display name> copied.`, so a second Copy is announced again. The button's visible text SHALL read `Copied` for 2 seconds, then `Copy email` again, keeping focus. Its accessible name SHALL follow its visible text (Criterion 5): `Copied for <Display name>` while it reads `Copied`, then `Copy email for <Display name>` again.
4. IF `navigator.clipboard` is missing, or `writeText` rejects, THEN THE Page SHALL select the email text and announce `Could not copy. The email is selected, so copy it with your keyboard or menu.`, and SHALL NOT throw or log.
5. Every link and button in the Helper panel SHALL have an `aria-label` that starts with its exact visible text and ends with ` for <Display name>`, so the visible label is part of the name (WCAG 2.5.3 Label in Name) and the helpers of two tombstones never share a name, whether or not a panel is expanded. Examples: `Open the Netflix cancel page (netflix.com) for Netflix`, `Apple subscriptions for Netflix`, `Google Play subscriptions for Netflix`, `Copy email for Netflix`, `Open in my email app for Netflix`. Every link with `target="_blank"` SHALL also have a visually hidden `(opens in a new tab)` text, referenced with `aria-describedby` so it is the link's accessible description and the name still ends with ` for <Display name>`. Every accessible name on the Page SHALL be unique (graveyard-ui `expectUniqueButtonNames` extended to links), checked with both panels of two tombstones mounted.
6. At 320 px and at 390 px viewport width, and at 390 px with 200 % text zoom, THE Helper panel SHALL fit the viewport with no horizontal scrolling: long hosts, service names and email lines SHALL wrap (`overflow-wrap: anywhere`), and every button and link SHALL have a target of at least 44 × 44 CSS px.
7. With `prefers-reduced-motion: reduce`, opening or closing the panel and the `Copied` change SHALL use only an opacity fade of at most 150 ms (`spooky-design.md`).
8. Colour SHALL never be the only signal: the external links SHALL be underlined and the app-store note SHALL be text, not an icon alone.

---

### Requirement 9: Amendment to graveyard-ui (serviceId on the Answer record)

**User Story:** As the tombstone, I want to know which Known service a buried record is, so that I can show its cancel page without keeping the Subscription around.

#### Acceptance Criteria

1. THE graveyard-ui Answer record (graveyard-ui Glossary) SHALL get one new field `serviceId: string | null`, copied by `answerRecordFor` from `Subscription.serviceId`. The record still holds no transaction, date, price history, description or evidence.
2. Graveyard-ui Requirement 9.5 SHALL also refresh `serviceId` from the subscription when a new Analysis outcome arrives. The graveyard-ui `requirements.md` SHALL get a note in Glossary "Answer record" and in Requirement 9.5 saying this spec added the field, and a note in Requirement 5.7 saying the tombstone line is now the one in Requirement 7.1 of this spec, and a note in Requirement 14.2 saying this spec places the Helper panel between the stage tombstone and `Next` in DOM and tab order on purpose (Requirement 8.2).
3. `serviceId` SHALL NOT change the record's `id`, Display name, totals or the order of records.
4. The existing graveyard-ui property and unit tests of Answer records SHALL be updated for the new field, and SHALL check that `serviceId` equals the Subscription's. Every hand-built `AnswerRecord` literal SHALL get `serviceId`, so `npm run typecheck` keeps passing: at least `apps/web/src/slice/graveyard/tombstone.test.tsx` (`NETFLIX`), `apps/web/src/slice/logic/graveyard.test.ts` and the graveyard arbitraries in `apps/web/src/slice/logic/test-arbitraries.ts`, plus any other file that a search for `AnswerRecord` finds building one.

---

### Requirement 10: Tests and amendments to existing tests

**User Story:** As the team, I want the cancel helper covered by unit, component and browser tests, and the old tombstone line removed from existing tests, so that the demo path proves the helper works before judging.

#### Acceptance Criteria

1. Unit tests in `packages/core/src/cancel` SHALL cover every example table of Requirements 2 and 3 (including the `"constructor"` and `"__proto__"` lookups), `mailtoHref` on a hand-built email with a lone surrogate, the frozen check of Requirement 1.7, the data test of Requirement 5.5 and 6.8, `requireVerified` on and off on a fixture with one `lastChecked: null` entry, and one failing fixture per rule of Requirement 6 (each producing exactly the expected `rule` and `field`). These per-rule fixtures are the validator's edit coverage; there is no generated-database property. The `requireVerified: true` test on the real data is added only by the human step of Requirement 6.12.
2. Component tests (Vitest, jsdom, Testing Library, `userEvent`) SHALL render the Page with the `us-signed.csv` Sample and cover: the stage tombstone shows `Still feeding until you cancel.` and no longer shows `Cancel it with the provider to stop the charges.`; burying Netflix shows the Helper panel of Requirement 7.10 with `target="_blank"` and `rel="noopener noreferrer"` on every external link; burying Riverside Gym Membership shows the email-only panel; Copy calls a mocked `navigator.clipboard.writeText` once with the subject, a blank line and the body, and the live region then reads `Email for Netflix copied.`; a rejecting mock and a missing `navigator.clipboard` give the message of Requirement 8.4 with no console output; the `How to cancel` disclosure in the Graveyard view toggles `aria-expanded`; an Ended tombstone (the Graveyard view given an outcome in which the buried Netflix has `status: "ended"`) shows `It has stopped charging.` and no `How to cancel` button (Requirement 7.10); a panel with `lastChecked: null` shows no `Link checked` line; the `Open in my email app` hint is shown; a second Copy clears and rewrites the live region; and every panel name starts with its visible text, ends with ` for <Display name>`, and stays unique with two panels mounted (Requirement 8.5).
3. `apps/web/src/slice/graveyard/tombstone.test.tsx` SHALL be updated for Requirement 7.1 (both stone lines) and for the `serviceId` field of Requirement 9.4.
4. THE Playwright test `apps/web/e2e/demo-path.spec.ts` SHALL keep all its graveyard-ui Requirement 16.4 steps and checks, and after the Netflix tombstone appears SHALL also check that the Helper panel shows a link to a Netflix Provider domain over `https` with `rel="noopener noreferrer"`, and that `Open in my email app` has an href starting `mailto:?subject=Please%20cancel%20my%20Netflix%20subscription`. It SHALL NOT click either link. Its request check SHALL keep failing on any request to a host other than the Page's origin, which proves that rendering the panel requests no provider URL.
5. `apps/web/e2e/layout.spec.ts` SHALL check at 320 × 568 and at 390 × 844 that, with the Netflix Helper panel shown, `document.documentElement.scrollWidth` is not greater than the viewport width.
6. THE `privacy-guard` hook, the `no-network` scans and the build-time CSP SHALL keep passing with no new exception.

---

### Requirement 11: Correctness properties

**User Story:** As the team, I want the cancel helper's guarantees checked on generated inputs, so that no service name, amount or data edit can make the email leak data or the links point somewhere unsafe.

#### Acceptance Criteria

1. Property tests SHALL live in `.property.test.ts` files next to their source in `packages/core/src/cancel`, use fast-check with its default 100 runs, and generate Email inputs from arbitrary strings (including control characters, line breaks, U+2028, surrogate pairs, lone surrogates, format characters such as U+200B, U+202E and U+FEFF, `[`, `]`, `%`, `&`, `?`, `#` and digit runs), all three cadences plus invalid ones, both values of `cadenceAssumed`, and currencies both valid and invalid.
2. *(PBT: template only)* FOR ALL Email inputs, the test SHALL compute `N` and `A` with an independent reference implementation of the cleaning of Requirement 3.2, choose the template of Requirement 3.3 and 3.4 from `cadence`, `cadenceAssumed`, whether `currency` is valid, whether `A` is empty and whether `N` is empty, and build the expected `subject` and `body` by filling the template's name, amount and currency slots by position (concatenating the fixed template pieces with `N`, `A` and `C`, never by searching for `N` or `A` in the text). The actual `subject` and `body` SHALL equal the expected ones. This holds when `N` or `A` is empty, when `N === A`, and when `N` occurs in the template text (for example `N = "Please"`). So the email holds nothing from the input but the cleaned name, the cleaned amount and the currency code.
3. *(PBT: placeholders untouched)* FOR ALL Email inputs, with `n(x, p)` the number of times `p` occurs in `x`, the body SHALL contain `[Your name]` exactly `2 + n(N, "[Your name]") + n(A, "[Your name]")` times and `[Your account email]` exactly `1 + n(N, "[Your account email]") + n(A, "[Your account email]")` times, where `N` and `A` are the cleaned name and amount, and SHALL end with `\n[Your name]`.
4. *(PBT: clean single-line fields)* FOR ALL Email inputs, `subject` SHALL contain no line break, control character, format character (`Cf`) or lone surrogate, SHALL have no leading or trailing space, and SHALL have at most `"Please cancel my ".length + 80 + " subscription".length` code points; `body` SHALL contain no control character other than `\n`, no format character, no lone surrogate, no U+2028 or U+2029, and no line with leading or trailing space.
5. *(PBT: deterministic, total)* FOR ALL Email inputs, `cancellationEmail` SHALL NOT throw, and two calls with deeply equal inputs SHALL return equal results; adding extra properties to the input SHALL NOT change the result.
6. *(PBT: mailto round trip)* FOR ALL Email inputs with `email = cancellationEmail(input)`, `mailtoHref(email)` SHALL NOT throw, SHALL start with `mailto:?subject=`, SHALL contain after `mailto:?` only characters that `encodeURIComponent` leaves unescaped, `%`, `=` and exactly one `&`, and splitting the query on `&` and the first `=` of each part and applying `decodeURIComponent` SHALL give back exactly `subject` and the body with `\r\n` line breaks.
7. *(PBT: lookup is total and exact)* FOR ALL strings and `null` as `serviceId` and FOR ALL strings as `currency`, `getCancelHelp` SHALL NOT throw; it SHALL return `kind: "link"` exactly when `serviceId` is the `serviceId` of a Cancel entry; and for every `"link"` result, `url` SHALL be the entry's `url` or one of its `regionalUrls`, `host` SHALL be on the entry's Provider domain list, and the result SHALL depend on `currency` only through `statementRegion(currency)`.
8. *(PBT: region choice)* FOR ALL Cancel entries and FOR ALL currencies, the `url` returned SHALL be `regionalUrls[statementRegion(currency)]` when that is defined and the entry's `url` otherwise.
9. *(PBT: validator is total)* FOR ALL values built by fast-check's `anything()` in place of the top-level `entries` or `emailOnly` argument, `validateCancelDatabase` SHALL NOT throw and SHALL return an array of issues in the order of Requirement 5.2, equal across two calls. Malformed fields inside an entry are covered by the per-rule unit fixtures of Requirement 10.1 and the `field-type` rule, not by a property. There is no generated-valid-database property; edit detection is covered by the per-rule fixtures of Requirement 10.1.
10. *(PBT: host check)* FOR ALL generated Provider domains `d` and host names `h`, the "is on" relation of the Glossary SHALL hold exactly when `h === d` or `h` ends with `"." + d`, so `notnetflix.com` is not on `netflix.com` and `help.netflix.com` is.
