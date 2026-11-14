# Requirements Document

## Introduction

The `merchant-normalizer` module lives in `packages/core/src/normalize` and is exported from `@zombills/core`. It turns the raw `description` of a bank-statement line (for example `"NETFLIX.COM 866-579-7172 CA"`) into a stable merchant identity (`Netflix`), so that the subscription detector can group charges from the same merchant across months even when the bank prints card prefixes, payment-processor prefixes, reference numbers, phone numbers or locations around the name.

The normalizer sits between the statement parser and the subscription detector. It reads `Transaction.description` only. It never reads, changes or computes money: `amountCents`, `date` and `currency` pass through untouched.

The module carries a built-in list of 59 known subscription services. Each service has a stable `serviceId`. The cancel-helper spec will key its cancel-URL database and email templates on the same `serviceId`, so the id is the shared key between the two modules.

The module is pure TypeScript with no network calls and no DOM access. Statement data never leaves the browser.

Out of scope for this spec:

- Recurring-charge detection, cadence and yearly cost (subscription-detector spec).
- Labels such as `zombie`, `possessed`, `trial-trap` (classifier spec).
- Cancel URLs and email templates (cancel-helper spec). This spec only defines the service ids the cancel helper will use.
- Removing city names. The normalizer has no gazetteer, so a city printed before a state code stays in a generic display name (`"BLUE BOTTLE COFFEE OAKLAND CA"` becomes `"Blue Bottle Coffee Oakland"`). The bank prints the same city every month, so grouping still works.
- Removing company legal forms (`INC`, `LLC`, `GMBH`, `AB`). Known services match regardless; for generic merchants the legal form stays in the name.
- Restoring truncated descriptions (`"NETFLIX.COM LOS GAT"`) beyond what alias matching already catches.
- Fuzzy or spelling-tolerant matching. Matching is rule-based and deterministic.
- Telling a gaming or reading subscription apart from store purchases when the bank prints the same text for both. Sony prints `"PLAYSTATION NETWORK"` for PlayStation Plus and for PlayStation Store purchases. Microsoft prints `"MICROSOFT*XBOX"` for Game Pass and for Xbox Store purchases. Nintendo prints `"NINTENDO"` plus a reference for Switch Online and eShop purchases. Electronic Arts prints `"ELECTRONIC ARTS"` or `"EA *ORIGIN"` for EA Play and for game purchases. Amazon prints `"KINDLE SVCS"` for Kindle Unlimited and for e-book purchases, and `"PRIME VIDEO"` for Prime membership charges as well as for rentals and channel add-ons. These lines become generic merchants (Requirement 4.8), and the subscription detector decides from amount and cadence whether they recur. They map to the subscription's service id only when the bank text names the subscription (`"XBOX GAME PASS"`, `"PLAYSTATION PLUS"`, `"KINDLE UNLIMITED"`).

---

## Glossary

- **Normalizer**: The `merchant-normalizer` module within `packages/core/src/normalize`.
- **Transaction**: The type exported by the statement parser: `{ date: string; description: string; amountCents: number; currency: string }`, where `date` is ISO `yyyy-mm-dd`, `amountCents` is integer cents (positive = money out, negative = money in) and `currency` is an upper-case ISO 4217 alpha-3 code.
- **Raw description**: The input string, normally `Transaction.description` exactly as the parser produced it.
- **MerchantIdentity**: The Normalizer's output for one raw description: `{ key: string; displayName: string; source: MerchantSource; serviceId: string | null; processor: ProcessorId | null }`.
- **MerchantSource**: `"known"` (matched a Known service), `"generic"` (no Known service matched, but a merchant name remained after cleanup) or `"unidentified"` (nothing that names a merchant remained after cleanup; see Requirement 6).
- **Merchant key** (`key`): The machine string the subscription detector groups on. Two raw descriptions belong to the same merchant exactly when their keys are equal.
- **Display name** (`displayName`): The human-readable merchant name shown on cards and tombstones.
- **Known service**: An entry in the built-in service list, `{ serviceId, displayName, category, variants }`.
- **Service id** (`serviceId`): The stable identifier of a Known service, matching `^[a-z0-9]+(-[a-z0-9]+)*$` (lower-case ASCII kebab-case, e.g. `"netflix"`, `"disney-plus"`, `"1password"`). Shared with the cancel-helper spec.
- **Variant**: One way a bank may print a Known service (e.g. `"NETFLIX"`, `"NETFLIX COM"`, `"NFLX"`), with a match mode of `"contains"` or `"exact"` (Requirement 4).
- **Payment processor**: An intermediary whose prefix appears before the real merchant name (Requirement 3). Identified by a **ProcessorId**: `"paypal"`, `"square"`, `"shopify"`, `"amazon-marketplace"`, `"google"`, `"apple"`, `"sumup"`, `"zettle"`, `"toast"`.
- **Noise**: Any part of a raw description that does not name the merchant: card and POS prefixes, payment-processor prefixes, reference numbers, phone numbers, URL and domain parts, state and country codes, dates, store numbers, masked card numbers, asterisks, repeated whitespace and letter case (Requirement 3).
- **Unidentified residue**: The text an unidentified key is built from (Requirement 6.2): the Folded raw description with card, POS and debit prefixes (Requirement 3.2), masked card numbers (Requirement 3.3) and dates (Requirement 3.5) removed, whitespace runs collapsed to one space and the ends trimmed. Nothing else is removed, so reference numbers, phone numbers, processor forms and location codes stay.
- **Cleaned name**: What remains of a raw description after all noise is removed (Requirement 3), before title-casing.
- **Folding**: The comparison form used for matching and for keys: Unicode NFKD decomposition, removal of combining marks (general category M), the explicit letter map `ø→o`, `æ→ae`, `œ→oe`, `ł→l`, `đ→d`, `ð→d`, `þ→th` (and their upper-case forms), then `toUpperCase()` followed by `toLowerCase()`. Folding uses the locale-independent case functions only, never `toLocaleUpperCase` / `toLocaleLowerCase`. Examples: `"Café"` → `"cafe"`, `"STRAßE"` → `"strasse"`, `"Ørsted"` → `"orsted"`.
- **NormalizedTransaction**: A `Transaction` plus a `merchant: MerchantIdentity` field.

---

## Requirements

### Requirement 1: Public API and output shape

**User Story:** As the subscription detector, I want one function that turns a raw description into a merchant identity with a grouping key, a display name and a source, so that I can group charges without knowing anything about bank formatting.

#### Acceptance Criteria

1. THE Normalizer SHALL export from `@zombills/core` a function `normalizeMerchant(description: string): MerchantIdentity` and the types `MerchantIdentity`, `MerchantSource`, `ProcessorId`, `KnownService` and `NormalizedTransaction`.
2. THE Normalizer SHALL return a `MerchantIdentity` whose `key` and `displayName` are non-empty strings.
3. WHEN the raw description matches a Known service (Requirement 4), THE Normalizer SHALL return `source: "known"`, `serviceId` equal to that service's id, `key` equal to that service's id, and `displayName` equal to that service's display name.
4. WHEN no Known service matches and the Cleaned name is non-empty and folds to at least one letter or digit, THE Normalizer SHALL return `source: "generic"`, `serviceId: null`, a `key` of the form `"merchant:<slug>"` and a title-cased `displayName`, as specified in Requirement 5.
5. WHEN no Known service matches and the Cleaned name is empty or folds to no letter or digit, THE Normalizer SHALL return `source: "unidentified"`, `serviceId: null` and the `key` and `displayName` specified in Requirement 6.
6. THE Normalizer SHALL set `processor` to the ProcessorId of the payment-processor prefix found in the raw description (Requirement 3.4), or `null` when there is none, for every `source`.
7. THE Normalizer SHALL guarantee that keys of different sources never collide: a `"known"` key never contains `:`, every `"generic"` key starts with `"merchant:"` and every `"unidentified"` key starts with `"unidentified:"`.
8. THE Normalizer SHALL NOT include the payment processor in a `"known"` or `"generic"` key, so that `"PAYPAL *SPOTIFY"` and `"SPOTIFY P1A2B3C4D5"` both get key `"spotify"`.
9. THE `normalizeMerchant` function SHALL throw a `TypeError` only when `description` is not a string (a type contract violation, as in the statement parser). FOR ALL string inputs it SHALL return a `MerchantIdentity` and SHALL NOT throw.

---

### Requirement 2: Folding, case and accents

**User Story:** As a user whose bank prints names in capitals one month and mixed case the next, or with and without accents, I want those lines treated as the same merchant, so that one subscription is not split into several.

#### Acceptance Criteria

1. THE Normalizer SHALL compare raw descriptions against noise patterns, processor prefixes and Variants in Folded form, so that all matching is case-insensitive and accent-insensitive.
2. THE Normalizer SHALL build `"generic"` keys from the Folded Cleaned name (Requirement 5.2), so that `"CAFÉ MÜLLER"`, `"Cafe Muller"` and `"café müller"` get the same key `"merchant:cafe-muller"`.
3. THE Normalizer SHALL keep letters from every script in generic keys and display names. It SHALL NOT drop non-Latin letters (e.g. `"ЯНДЕКС ПЛЮС"` keeps its Cyrillic letters in the key and display name).
4. THE Normalizer SHALL build `"generic"` display names from the input's own letters in Unicode NFKC form, so accents present in the raw description are kept (`"CAFÉ MÜLLER 0412"` → `"Café Müller"`) and compatibility characters are mapped to their plain forms (`"ＣＡＦＥ"` → `"Cafe"`), even though the key ignores accents.
5. THE Normalizer SHALL NOT depend on the runtime locale, the time zone or the current date. *(PBT: case-insensitivity — FOR ALL strings `s`, `normalizeMerchant(s)`, `normalizeMerchant(s.toUpperCase())` and `normalizeMerchant(s.toLowerCase())` SHALL have equal `key`, `source`, `serviceId` and `processor`.)*

---

### Requirement 3: Noise removal

**User Story:** As the subscription detector, I want card prefixes, processor prefixes, reference numbers, phone numbers, domains, locations, dates and store numbers removed, so that two charges from the same merchant that differ only by this noise get the same key.

#### Acceptance Criteria

1. THE Normalizer SHALL treat `*`, `_`, `/`, `\`, `|`, `,`, `;`, `:`, `"`, `(`, `)`, `[`, `]`, `{`, `}`, `<`, `>`, `=`, `!` and `?` as token separators, and SHALL collapse every run of whitespace and separators into one space and trim the ends. THE Normalizer SHALL keep `&`, `'`, `+`, `-` and `.` inside a token only when they sit between two letters or digits (`"AT&T"`, `"MCDONALD'S"`, `"DISNEY+"`, `"7-ELEVEN"`), with the exception that a trailing `+` directly after a letter is kept (`"DISNEY+"`, `"APPLE TV+"`). Domain dots are handled by Criterion 7 before this step.
2. THE Normalizer SHALL remove, at the start of the description and repeatedly until none is left, these card, POS and debit prefixes (matched on whole tokens, in Folded form): `POS`, `POS PURCHASE`, `POS DEBIT`, `PURCHASE`, `CARD PURCHASE`, `DEBIT CARD PURCHASE`, `DEBIT CARD`, `DEBIT`, `VISA`, `VISA PURCHASE`, `VISA DEBIT`, `MASTERCARD`, `CHECKCARD`, `CHECK CARD`, `RECURRING`, `RECURRING PAYMENT`, `RECURRING DEBIT`, `ACH`, `ACH DEBIT`, `DD`, `DIRECT DEBIT`, `SEPA DIRECT DEBIT`, `CONTACTLESS`, `KARTENZAHLUNG`, `LASTSCHRIFT`, `SEPA LASTSCHRIFT`, `SEPA-LASTSCHRIFT`, `PRELEVEMENT`. Where prefixes overlap, the longest match SHALL be removed first. A prefix that becomes leading only after masked card numbers (Criterion 3) or dates (Criterion 5) before it are removed SHALL also be removed (`"POS 12/03 PURCHASE NETFLIX"` → `"NETFLIX"`).
3. THE Normalizer SHALL remove masked card numbers anywhere in the description: tokens made of two or more `X` or `*` characters followed by 4 digits (`"XXXX1234"`, `"****1234"`), and the phrases `CARD <4 digits>`, `CARD ENDING <4 digits>` and `CARD NO <4 digits>`.
4. WHEN, after card prefixes (Criterion 2), masked card numbers (Criterion 3) and dates (Criterion 5) have been removed, the description starts with one of these payment-processor forms, THE Normalizer SHALL record the ProcessorId and remove the form:

   | Form (Folded, `*` = a literal asterisk, optional spaces around it) | ProcessorId |
   | --- | --- |
   | `PAYPAL *`, `PP*` | `paypal` |
   | `SQ *` | `square` |
   | `SP *` | `shopify` |
   | `AMZN MKTP <2-letter code>*`, `AMZN MKTP <2-letter code>`, `AMZN MKTP`, `AMAZON MKTPLACE` | `amazon-marketplace` |
   | `GOOGLE *` | `google` |
   | `APPLE.COM/BILL` | `apple` |
   | `SUMUP *` | `sumup` |
   | `IZ *`, `ZETTLE_*` | `zettle` |
   | `TST*` | `toast` |

   Forms that require `*` SHALL NOT match without it, so `"GOOGLE STORAGE"` and `"SQUARESPACE"` are not processor prefixes. At most one processor SHALL be recorded per description; a further leading Amazon Marketplace form after the recorded processor is removed as noise without being recorded (`"SQ *AMZN MKTP FOO"` → processor `square`, Cleaned name `"FOO"`).
5. THE Normalizer SHALL remove dates anywhere in the description: `yyyy-mm-dd`, `dd/mm`, `mm/dd`, `dd.mm`, `dd-mm`, `dd/mm/yy`, `dd/mm/yyyy`, `mm/dd/yy`, `mm/dd/yyyy`, `dd.mm.yy`, `dd.mm.yyyy`, and a 1–2 digit day joined to or separated by a space from an English three-letter month abbreviation (`"12JAN"`, `"JAN12"`, `"12 JAN"`). A date token SHALL be removed only when its day and month values are within 1–31 and 1–12 in at least one of the readings.
6. THE Normalizer SHALL remove phone numbers anywhere in the description: an optional `+`, then 7 to 15 digits, where digit groups may be separated by single `-`, `.` or space characters and the first group may be wrapped in parentheses (`"866-579-7172"`, `"1-800-123-4567"`, `"(800) 123 4567"`, `"+44 20 7946 0958"`). Space-separated digit groups without a leading `+` or `(` count as a phone number only in the North American shape `ddd ddd dddd`, optionally preceded by `1`, so that a preceding number such as the `365` in `"MICROSOFT 365 866 579 7172"` is kept.
7. THE Normalizer SHALL handle URLs and domain names: it SHALL remove `http://`, `https://` and a leading `www.`; it SHALL remove any `/path` after a domain; and for a token of the form `<labels>.<tld>` (with `tld` from a fixed list including at least `com`, `net`, `org`, `io`, `co`, `tv`, `app`, `me`, `us`, `uk`, `co.uk`, `com.au`, `de`, `fr`, `nl`, `es`, `it`, `eu`) it SHALL replace the token with the label just before the TLD when the token is the first remaining token (`"NETFLIX.COM"` → `"NETFLIX"`, `"HELP.MAX.COM"` → `"MAX"`, `"WWW.NYTIMES.COM"` → `"NYTIMES"`), and SHALL remove the token entirely otherwise (`"AUDIBLE AMZN.COM/BILL NJ"` → `"AUDIBLE"`).
8. THE Normalizer SHALL remove reference numbers anywhere in the description: tokens of 4 or more digits only, and tokens of 6 or more letters and digits that contain at least 2 digits and at least 1 letter (`"2K4LJ8MB3"`, `"P1A2B3C4D5"`). Tokens with a single digit (e.g. `"1PASSWORD"`) and tokens shorter than 6 characters with letters (e.g. `"MP3"`, `"B2B"`) SHALL be kept.
9. THE Normalizer SHALL remove store numbers: a `#` followed by digits anywhere (`"#0412"`), the phrases `STORE <digits>`, `NO <digits>`, `NR <digits>` anywhere, and a trailing token of digits only.
10. THE Normalizer SHALL remove trailing location codes: a trailing token equal to a US state or territory code, a Canadian province code, an ISO 3166-1 alpha-2 country code, or `USA`. THE Normalizer SHALL repeat this until the last token is not a location code. WHEN no processor prefix was found, THE Normalizer SHALL NOT remove a location code that is the only token left (so `"BP"` and `"BP 0412"` clean to `"BP"`). WHEN a processor prefix was found, THE Normalizer SHALL remove location codes even if nothing remains, so `"APPLE.COM/BILL 866-712-7753 CA"` cleans to an empty name and Requirement 6 applies. Location codes SHALL only be removed from the end; `"TANKSTELLE AM RING"` keeps `"AM"`.
11. THE Normalizer SHALL apply Criteria 1–10 so that the result is a fixed point: cleaning a Cleaned name again SHALL return the same Cleaned name. (The design decides the order of steps; this criterion fixes the outcome, for example `"FOO AM DE"` cleans to `"FOO"` in one pass, not to `"FOO AM"`.)
12. Examples the implementation SHALL satisfy, given that no Known service matches the generic ones:

    | Raw description | `source` | `key` | `displayName` | `processor` |
    | --- | --- | --- | --- | --- |
    | `NETFLIX.COM 866-579-7172 CA` | `known` | `netflix` | `Netflix` | `null` |
    | `POS PURCHASE NETFLIX.COM LOS GATOS CA` | `known` | `netflix` | `Netflix` | `null` |
    | `PAYPAL *SPOTIFY P1A2B3C4D5` | `known` | `spotify` | `Spotify` | `paypal` |
    | `GOOGLE *YouTubePremium g.co/helppay#` | `known` | `youtube-premium` | `YouTube Premium` | `google` |
    | `SQ *BLUE BOTTLE COFFEE #0412 OAKLAND CA` | `generic` | `merchant:blue-bottle-coffee-oakland` | `Blue Bottle Coffee Oakland` | `square` |
    | `DEBIT CARD PURCHASE XXXX1234 12/03 JOE'S PIZZA 0042` | `generic` | `merchant:joe-s-pizza` | `Joe's Pizza` | `null` |
    | `  joe's   pizza  ` | `generic` | `merchant:joe-s-pizza` | `Joe's Pizza` | `null` |

---

### Requirement 4: Built-in Known service list

**User Story:** As a user, I want common subscriptions recognised by their real names whatever processor or format my bank uses, and as the cancel helper, I want a stable service id for each, so that the card shows "Netflix" and the cancel link can be looked up by id.

#### Acceptance Criteria

1. THE Normalizer SHALL export `KNOWN_SERVICES: readonly KnownService[]` and `getKnownService(serviceId: string): KnownService | undefined`, where `KnownService` is `{ serviceId: string; displayName: string; category: ServiceCategory; variants: readonly ServiceVariant[] }`, `ServiceVariant` is `{ text: string; match: "contains" | "exact" }`, and `ServiceCategory` is one of `"video-streaming"`, `"music-audio"`, `"software"`, `"cloud-storage"`, `"news-reading"`, `"fitness-wellness"`, `"food-delivery"`, `"gaming"`.
2. THE `KNOWN_SERVICES` list SHALL contain at least the following services with exactly these service ids and display names:

   | Category | `serviceId` → `displayName` |
   | --- | --- |
   | `video-streaming` | `netflix` → Netflix; `disney-plus` → Disney+; `hulu` → Hulu; `max` → Max; `paramount-plus` → Paramount+; `peacock` → Peacock; `apple-tv-plus` → Apple TV+; `youtube-premium` → YouTube Premium; `amazon-prime` → Amazon Prime; `crunchyroll` → Crunchyroll; `dazn` → DAZN; `espn-plus` → ESPN+; `discovery-plus` → discovery+; `sling-tv` → Sling TV |
   | `music-audio` | `spotify` → Spotify; `apple-music` → Apple Music; `amazon-music` → Amazon Music Unlimited; `youtube-music` → YouTube Music; `tidal` → TIDAL; `deezer` → Deezer; `audible` → Audible; `siriusxm` → SiriusXM; `pandora` → Pandora |
   | `software` | `microsoft-365` → Microsoft 365; `adobe` → Adobe Creative Cloud; `1password` → 1Password; `nordvpn` → NordVPN; `expressvpn` → ExpressVPN; `canva` → Canva; `chatgpt-plus` → ChatGPT Plus; `duolingo` → Duolingo; `grammarly` → Grammarly; `linkedin-premium` → LinkedIn Premium |
   | `cloud-storage` | `icloud` → iCloud+; `google-one` → Google One; `dropbox` → Dropbox |
   | `news-reading` | `new-york-times` → The New York Times; `washington-post` → The Washington Post; `wall-street-journal` → The Wall Street Journal; `the-economist` → The Economist; `the-guardian` → The Guardian; `medium` → Medium; `kindle-unlimited` → Kindle Unlimited |
   | `fitness-wellness` | `peloton` → Peloton; `strava` → Strava; `classpass` → ClassPass; `headspace` → Headspace; `calm` → Calm; `planet-fitness` → Planet Fitness |
   | `food-delivery` | `doordash-dashpass` → DashPass; `uber-one` → Uber One; `grubhub-plus` → Grubhub+; `instacart-plus` → Instacart+; `deliveroo-plus` → Deliveroo Plus; `hellofresh` → HelloFresh |
   | `gaming` | `xbox-game-pass` → Xbox Game Pass; `playstation-plus` → PlayStation Plus; `nintendo-switch-online` → Nintendo Switch Online; `ea-play` → EA Play |

3. Every `serviceId` SHALL be unique, SHALL match `^[a-z0-9]+(-[a-z0-9]+)*$`, and SHALL be treated as a stable public identifier: renaming or removing one is a breaking change for the cancel-helper spec. Adding services SHALL NOT change the id of an existing service.
4. Every Known service SHALL have at least two Variants, one of which is its own display name. Variant `text` SHALL be written in Folded, cleaned form (as produced by Requirement 3) so it can be compared directly. For a `"contains"` Variant, cleaned form means the text as it appears after the steps listed in Criterion 5 (so `"microsoft 365"` keeps `"365"`); for an `"exact"` Variant it means the Cleaned name.
5. WHEN a Variant has `match: "contains"`, THE Normalizer SHALL treat it as matching when its tokens appear as a contiguous whole-token sequence in the Folded description after card prefixes (3.2), masked card numbers (3.3), the processor prefix (3.4), dates (3.5), phone numbers (3.6) and URL/domain handling (3.7) have been applied, OR as a contiguous whole-token sequence in the Folded Cleaned name. (The first text keeps tokens such as `"365"` in `"MICROSOFT 365"` that later cleanup removes; the second catches names that only become adjacent after cleanup, such as `"UBER 0412 ONE"`, so that a generic display name can never match a Known service on a second pass.) Whole-token matching means `"APPLE"` does not match `"APPLEBEES"`.
6. WHEN a Variant has `match: "exact"`, THE Normalizer SHALL treat it as matching only when it equals the whole Folded Cleaned name. Short or ambiguous Variants (e.g. `"MAX"`, `"CALM"`, `"MEDIUM"`, `"PEACOCK"`, `"TIDAL"`) SHALL use `"exact"`, so that `"MAX MUSTERMANN"` and `"CALM WATERS SPA"` are not mistaken for Max or Calm.
7. WHEN more than one Variant matches, THE Normalizer SHALL choose the Variant with the most characters, and on a tie the one whose service appears first in `KNOWN_SERVICES`. So `"AMAZON PRIME VIDEO"` and `"AMAZON MUSIC"` resolve to different services, and `"YOUTUBE PREMIUM"` beats `"YOUTUBE"`.
8. THE Variants SHALL distinguish a subscription from other products of the same company where banks print them differently: `"UBER ONE"` → `uber-one`, but `"UBER *TRIP"` and `"UBER EATS"` SHALL NOT match `uber-one`; `"AMZN MKTP US*2K4LJ8MB3"` SHALL NOT match `amazon-prime`. The same rule SHALL apply to gaming and reading:

   | Raw description | Result |
   | --- | --- |
   | `MICROSOFT*XBOX GAME PASS`, `XBOX GAME PASS ULTIMATE`, `XBOX GAMEPASS` | `xbox-game-pass` |
   | `MICROSOFT*XBOX 425-681-4800 WA`, `MICROSOFT*STORE` | generic (`merchant:microsoft-xbox`, `merchant:microsoft-store`); not `xbox-game-pass` or `microsoft-365` |
   | `PLAYSTATION PLUS`, `PS PLUS 12 MONTH`, `SIE PLAYSTATION PLUS` | `playstation-plus` |
   | `PLAYSTATION NETWORK 877-971-7669 CA`, `SONY PLAYSTATION STORE` | generic; not `playstation-plus` |
   | `NINTENDO SWITCH ONLINE`, `NINTENDO SW ONLINE` | `nintendo-switch-online` |
   | `NINTENDO CD1234567 WA`, `NINTENDO ESHOP` | generic; not `nintendo-switch-online` |
   | `EA PLAY`, `EA *EA PLAY`, `ELECTRONIC ARTS EA PLAY` | `ea-play` |
   | `ELECTRONIC ARTS`, `EA *ORIGIN` | generic; not `ea-play` |
   | `KINDLE UNLIMITED`, `AMAZON KINDLE UNLTD` | `kindle-unlimited` |
   | `KINDLE SVCS*2K4LJ8MB3` | generic (`merchant:kindle-svcs`); not `kindle-unlimited` or `amazon-prime` |
   | `AMAZON PRIME`, `AMAZON PRIME MEMBERSHIP`, `AMZN PRIME` | `amazon-prime` |
   | `PRIME VIDEO*2K4LJ8MB3`, `PRIME VIDEO CHANNELS` | generic (`merchant:prime-video`, `merchant:prime-video-channels`); not `amazon-prime` |

   Therefore `"MICROSOFT"`, `"XBOX"`, `"PLAYSTATION"`, `"PLAYSTATION NETWORK"`, `"PS"`, `"NINTENDO"`, `"ELECTRONIC ARTS"`, `"EA"`, `"KINDLE"` and `"PRIME VIDEO"` SHALL NOT be Variants of any service. Where the bank text cannot tell a subscription from a purchase, the out-of-scope list in the Introduction applies.
9. WHEN a raw description is only a processor form with nothing else (e.g. `"APPLE.COM/BILL"`, `"GOOGLE *"`), THE Normalizer SHALL NOT match it to a Known service of that company; Requirement 6 applies.
10. A unit test fixture SHALL contain, for every Known service, at least one realistic raw description that maps to it, and THE test suite SHALL check that each maps to the expected `serviceId`.
11. *(PBT: list invariant — FOR ALL Known services `s` and FOR ALL Variants `v` of `s`, `normalizeMerchant(v.text).serviceId` SHALL equal `s.serviceId`, and `normalizeMerchant(s.displayName).serviceId` SHALL equal `s.serviceId`.)*

---

### Requirement 5: Generic fallback for unknown merchants

**User Story:** As a user with a local gym or a niche app that is not in the built-in list, I want it still grouped and shown under a readable name, so that it can rise as an undead card like any known service.

#### Acceptance Criteria

1. WHEN no Known service matches and the Cleaned name folds to at least one letter or digit, THE Normalizer SHALL return `source: "generic"`.
2. THE Normalizer SHALL build the generic key as `"merchant:"` followed by the slug of the Cleaned name, where the slug is the Folded Cleaned name with every run of characters that are not letters or digits (Unicode `\p{L}` or `\p{N}`) replaced by a single `-`, and leading and trailing `-` removed.
3. THE Normalizer SHALL build the generic display name by title-casing the Cleaned name word by word: the first letter of each space-separated word and of each part after `-` upper case, and all other letters lower case, using the locale-independent case functions (`"JOE'S PIZZA"` → `"Joe's Pizza"`, `"7-ELEVEN"` → `"7-Eleven"`).
4. WHEN two raw descriptions differ only by Noise as defined in Requirement 3, THE Normalizer SHALL return the same generic key for both.
5. THE Normalizer SHALL NOT merge two generic merchants whose Folded Cleaned names differ in any letter or digit.
6. *(PBT: generic noise-insensitivity — FOR ALL merchant names built from 1–4 words of 3–12 letters (ASCII and Latin-1 accented letters), excluding words that appear in any noise list of Requirement 3 and names that match any Known service Variant, and FOR ALL noise drawn from the generator in Requirement 9.4, the noisy description SHALL have `source: "generic"` and the same `key` as the bare name.)*

---

### Requirement 6: Processor-only and noise-only descriptions

**User Story:** As a user, I want unrelated charges that my bank prints only as `"PAYPAL *"` or `"APPLE.COM/BILL"` kept apart rather than lumped into one fake subscription, so that the app never tells me to cancel something that is really several different things.

#### Acceptance Criteria

1. WHEN the Cleaned name is empty or folds to no letter or digit (for example the raw description is `"PAYPAL *"`, `"PAYPAL *1234567890"`, `"AMZN MKTP US*2K4LJ8MB3"`, `"POS 01/12 123456"` or `""`), and no Known service matched, THE Normalizer SHALL return `source: "unidentified"`.
2. THE Normalizer SHALL build the unidentified key as `"unidentified:"` followed by the ProcessorId or `"none"`, then `":"`, then the Unidentified residue: the Folded raw description with card, POS and debit prefixes (Requirement 3.2), masked card numbers (Requirement 3.3) and dates (Requirement 3.5) removed, whitespace runs collapsed to one space and the ends trimmed. These three kinds of noise change from month to month but never identify a merchant. No other noise SHALL be removed from this part of the key; reference numbers, phone numbers, processor forms and location codes stay. Each removed prefix, masked card number or date takes the separator characters directly after it out of the residue too, so `"APPLE.COM/BILL*12/03*CA"` and `"APPLE.COM/BILL*CA"` give the same residue. WHEN the Unidentified residue is empty (e.g. the raw description is `""` or `"POS 01/12"`), THE Normalizer SHALL use `"-"` in its place, so the key is never left ending in `":"`.
3. THE Normalizer SHALL therefore give two unidentified descriptions the same key only when their Unidentified residues are identical. Examples:

   | Raw description A | Raw description B | Same key? |
   | --- | --- | --- |
   | `DEBIT CARD PURCHASE 12/03 APPLE.COM/BILL 866-712-7753 CA` | `DEBIT CARD PURCHASE 01/04 APPLE.COM/BILL 866-712-7753 CA` | yes: `unidentified:apple:apple.com/bill 866-712-7753 ca` |
   | `POS XXXX1234 APPLE.COM/BILL 866-712-7753 CA` | `APPLE.COM/BILL 866-712-7753 CA` | yes |
   | `PAYPAL *1234567890` | `PAYPAL *9876543210` | no |

   An identical line repeated every month SHALL get the same key each time, so the detector may still group it and use amount and cadence to decide.
4. THE Normalizer SHALL set the unidentified display name to `"<processor name> payment (merchant not shown)"` when a processor was found, with processor names `PayPal`, `Square`, `Shopify`, `Amazon Marketplace`, `Google`, `Apple`, `SumUp`, `Zettle`, `Toast`, and to `"Unknown merchant"` when none was found.
5. THE Normalizer SHALL NOT guess a merchant for an unidentified description from its amount, date, or any other Transaction field.

---

### Requirement 7: European descriptions and the EU sample statement

**User Story:** As a European user, I want German and other non-English descriptions cleaned and grouped as well as US ones, so that the app works with my bank's export.

#### Acceptance Criteria

1. WHEN `samples/eu-semicolon.csv` is parsed with `parseStatement` and every description is normalized, THE Normalizer SHALL return:

   | Raw description | `source` | `key` | `displayName` |
   | --- | --- | --- | --- |
   | `GEHALT BEISPIEL GMBH` | `generic` | `merchant:gehalt-beispiel-gmbh` | `Gehalt Beispiel Gmbh` |
   | `STREAMING DIENST MONATSBEITRAG` | `generic` | `merchant:streaming-dienst-monatsbeitrag` | `Streaming Dienst Monatsbeitrag` |
   | `SUPERMARKT NORD 0412` | `generic` | `merchant:supermarkt-nord` | `Supermarkt Nord` |
   | `MUSIKDIENST PREMIUM` | `generic` | `merchant:musikdienst-premium` | `Musikdienst Premium` |
   | `FITNESSSTUDIO LINDENHOF` | `generic` | `merchant:fitnessstudio-lindenhof` | `Fitnessstudio Lindenhof` |
   | `TANKSTELLE AM RING` | `generic` | `merchant:tankstelle-am-ring` | `Tankstelle Am Ring` |
   | `ONLINE SHOP RUECKERSTATTUNG` | `generic` | `merchant:online-shop-rueckerstattung` | `Online Shop Rueckerstattung` |

   All rows with the same description SHALL get the same key, so the sample yields exactly 7 distinct keys.
2. THE Normalizer SHALL NOT map any description in `samples/eu-semicolon.csv` to a Known service. (The sample uses invented names on purpose; `"STREAMING"`, `"PREMIUM"` and `"MUSIK"` SHALL NOT be Variants.)
3. THE Normalizer SHALL treat `"ß"` and `"SS"` as equal in keys, and accented and unaccented spellings as equal in keys (`"RÜCKERSTATTUNG"` and `"RUCKERSTATTUNG"` share a key). It SHALL NOT treat German transliterations as equal (`"RÜCKERSTATTUNG"` and `"RUECKERSTATTUNG"` get different keys), because that would need language detection.
4. THE Normalizer SHALL recognise the European card and debit prefixes listed in Requirement 3.2 (`KARTENZAHLUNG`, `LASTSCHRIFT`, `SEPA LASTSCHRIFT`, `SEPA-LASTSCHRIFT`, `SEPA DIRECT DEBIT`, `PRELEVEMENT`), so `"SEPA-LASTSCHRIFT SPOTIFY AB"` maps to `spotify`.
5. THE Normalizer SHALL apply the same date rules (Requirement 3.5) to `dd.mm` and `dd.mm.yyyy` dates printed inside European descriptions (`"KARTENZAHLUNG 03.01. NETFLIX"` maps to `netflix`).

---

### Requirement 8: Normalize a whole statement

**User Story:** As the web UI, I want to normalize every transaction from a parsed statement in one call without the money data being touched, so that I can hand the result straight to the subscription detector.

#### Acceptance Criteria

1. THE Normalizer SHALL export `normalizeTransactions(transactions: readonly Transaction[]): NormalizedTransaction[]`.
2. THE `normalizeTransactions` function SHALL return an array of the same length as its input, in the same order, where element `i` has the same `date`, `description`, `amountCents` and `currency` as input element `i`, plus `merchant` equal to `normalizeMerchant(transactions[i].description)`. Only these five fields SHALL be present; any extra properties on an input object SHALL NOT be copied.
3. THE `normalizeTransactions` function SHALL NOT mutate the input array or any input `Transaction`, and SHALL return new objects.
4. THE `normalizeTransactions` function SHALL normalize debits, credits and zero-amount transactions alike; the sign or value of `amountCents` SHALL NOT affect the `merchant` result.
5. WHEN the input is an empty array, THE `normalizeTransactions` function SHALL return an empty array.
6. *(PBT: pass-through — FOR ALL arrays of `Transaction` with arbitrary descriptions, integer `amountCents`, ISO dates and currency codes, the output SHALL satisfy Criteria 2 and 3: same length and order, money and date fields deeply equal to the input, and the input deeply equal to a copy taken before the call.)*

---

### Requirement 9: Correctness properties

**User Story:** As the Zombills test suite, I want property-based tests for the Normalizer's core guarantees, so that fast-check can find inputs that break grouping before a user does.

#### Acceptance Criteria

1. *(PBT: never throws)* FOR ALL strings, including empty strings, whitespace-only strings, control characters, lone surrogates, emoji, mixed scripts and strings up to 10,000 characters, `normalizeMerchant` SHALL return a `MerchantIdentity` and SHALL NOT throw.
2. *(PBT: non-empty output)* FOR ALL strings, `key` and `displayName` SHALL be non-empty; `source` SHALL be one of the three MerchantSource values; `serviceId` SHALL be non-null exactly when `source` is `"known"`; and the key prefix rules of Requirement 1.7 SHALL hold.
3. *(PBT: deterministic)* FOR ALL strings, calling `normalizeMerchant` twice with the same input SHALL return deeply equal results, and calling `normalizeTransactions` twice with the same input SHALL return deeply equal results.
4. *(PBT: known-service noise-insensitivity)* FOR ALL Known services `s`, FOR ALL Variants `v` of `s`, and FOR ALL noise built from: an optional card prefix from Requirement 3.2; an optional processor form from Requirement 3.4; and zero to four suffix items drawn from phone numbers, reference numbers, dates, store numbers, masked card numbers, domain tokens and location codes as defined in Requirement 3; with random letter case, random runs of extra spaces and `*` between parts; the noisy description SHALL have `serviceId` equal to `s.serviceId`. The generator SHALL NOT produce reference tokens that are themselves Variants.
5. *(PBT: idempotent)* FOR ALL strings `s` where `r = normalizeMerchant(s)` has `source` `"known"` or `"generic"`, `normalizeMerchant(r.displayName)` SHALL have the same `key`, `source`, `serviceId` and `displayName` as `r`. Unidentified results are excluded, because their display name deliberately does not carry the raw text (Requirement 6.4).
6. *(PBT: cleanup fixed point)* FOR ALL strings, cleaning the Cleaned name again SHALL return it unchanged (Requirement 3.11).
7. *(PBT: case-insensitivity)* As stated in Requirement 2.5.
8. *(PBT: generic noise-insensitivity)* As stated in Requirement 5.6.
9. *(PBT: unidentified keys)* FOR ALL pairs of unidentified results, the keys SHALL be equal exactly when the processors are equal and the Unidentified residues are equal (Requirement 6.3). FOR ALL unidentified descriptions `d`, adding or changing a card prefix, a masked card number or a date (as generated for Criterion 4) SHALL NOT change the key, and FOR ALL pairs of distinct reference-number tokens `r1`, `r2`, `"PAYPAL *" + r1` and `"PAYPAL *" + r2` SHALL get different keys.
10. *(Bounded time)* FOR ALL strings up to 10,000 characters, `normalizeMerchant` SHALL return within 250 ms in the Vitest Node environment, so that no pattern has catastrophic backtracking. The test inputs SHALL include, besides random strings, adversarial 10,000-character repetitions of the noise patterns: long digit runs, long runs of `*`, repeated date-like groups (`"12/12/12/12/…"`, `"01.01.01.…"`), repeated phone-like groups (`"1-2-3-4-…"`, `"(1) (2) (3) …"`), repeated card prefixes and processor forms (`"POS POS POS …"`, `"PAYPAL *PAYPAL *…"`), and long dotted domain-like tokens (`"a.a.a.a.….com"`).

---

### Requirement 10: No network calls and no DOM access

**User Story:** As the Zombills privacy contract, I want the Normalizer to be a pure in-browser module with no network calls, so that merchant names from the statement never leave the user's device.

#### Acceptance Criteria

1. THE Normalizer SHALL NOT contain any call to `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, or any other network API. The Known service list SHALL be bundled in the source and SHALL NOT be loaded from a URL.
2. THE Normalizer SHALL NOT access `document`, `window`, `navigator`, `localStorage`, or any other DOM or browser-global API.
3. WHEN the Normalizer module is imported in a Node.js Vitest environment with no browser polyfills loaded, THE Normalizer SHALL load and execute its exported functions without throwing a ReferenceError or any other runtime error caused by a missing browser global.
4. THE Normalizer SHALL NOT keep mutable module-level state between calls (no caches that change results, no counters), so that results depend only on the input.
5. IF the Normalizer source code is statically analysed and any reference to a network API (`fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`) or a DOM/browser-global API (`document`, `window`, `navigator`) is found, THEN THE Normalizer SHALL fail the static analysis check, producing an error indicating the offending API reference.
