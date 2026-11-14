// Realistic raw bank descriptions for every Known service, with the noise banks add: card
// prefixes, processors, phone numbers, domains, dates, store and reference numbers, state codes.
// Every phone number and reference number below is invented. Test-only: never published to dist.

export interface KnownServiceFixture {
  readonly serviceId: string;
  readonly descriptions: readonly string[];
}

const VIDEO_STREAMING_FIXTURES: readonly KnownServiceFixture[] = [
  { serviceId: "netflix", descriptions: ["NETFLIX.COM 866-579-7172 CA"] },
  { serviceId: "disney-plus", descriptions: ["PAYPAL *DISNEYPLUS 4029357733"] },
  { serviceId: "hulu", descriptions: ["HULU 877-8244 CA 0412"] },
  { serviceId: "max", descriptions: ["HELP.MAX.COM 855-555-0142 NY"] },
  { serviceId: "paramount-plus", descriptions: ["PARAMOUNT+ 03/14 800-555-0177 NY"] },
  { serviceId: "peacock", descriptions: ["PEACOCK 888-555-0113 NY"] },
  { serviceId: "apple-tv-plus", descriptions: ["APPLE TV+ APPLE.COM/BILL 866-555-0190 CA"] },
  {
    serviceId: "youtube-premium",
    descriptions: ["GOOGLE *YouTubePremium g.co/helppay#"],
  },
  { serviceId: "amazon-prime", descriptions: ["AMZN PRIME*2K4LJ8MB3 AMZN.COM/BILL WA"] },
  { serviceId: "crunchyroll", descriptions: ["CRUNCHYROLL 877-555-0166 TX"] },
  { serviceId: "dazn", descriptions: ["DAZN LIMITED LONDON GB"] },
  { serviceId: "espn-plus", descriptions: ["DEBIT CARD PURCHASE ESPN+ 800-555-0121 CT"] },
  { serviceId: "discovery-plus", descriptions: ["DISCOVERYPLUS.COM 03/05 NY"] },
  { serviceId: "sling-tv", descriptions: ["SLING TV 888-555-0155 CO"] },
];

const MUSIC_AUDIO_FIXTURES: readonly KnownServiceFixture[] = [
  { serviceId: "spotify", descriptions: ["SPOTIFY USA 877-555-0132 NEW YORK NY"] },
  { serviceId: "apple-music", descriptions: ["APPLE.COM/BILL APPLE MUSIC 866-555-0190 CA"] },
  { serviceId: "amazon-music", descriptions: ["AMZN MKTP US*AMAZON MUSIC UNLIMITED 4K7QX2MN9"] },
  { serviceId: "youtube-music", descriptions: ["GOOGLE *YOUTUBE MUSIC g.co/helppay#"] },
  { serviceId: "tidal", descriptions: ["TIDAL 03/02 NY"] },
  { serviceId: "deezer", descriptions: ["DEEZER PREMIUM PARIS FR"] },
  { serviceId: "audible", descriptions: ["AUDIBLE AMZN.COM/BILL NJ"] },
  { serviceId: "siriusxm", descriptions: ["SIRIUSXM.COM/ACCT 888-555-0181 NY"] },
  { serviceId: "pandora", descriptions: ["PANDORA 510-555-0144 CA"] },
];

const SOFTWARE_FIXTURES: readonly KnownServiceFixture[] = [
  { serviceId: "microsoft-365", descriptions: ["MICROSOFT*MICROSOFT 365 MSBILL.INFO WA"] },
  { serviceId: "adobe", descriptions: ["ADOBE *CREATIVE CLOUD 800-555-0166 CA"] },
  { serviceId: "1password", descriptions: ["1PASSWORD 03/09 TORONTO ON"] },
  { serviceId: "nordvpn", descriptions: ["NORDVPN.COM 800-555-0128 PA"] },
  { serviceId: "expressvpn", descriptions: ["EXPRESSVPN 03/11 VG"] },
  { serviceId: "canva", descriptions: ["CANVA* I04512-3345678 SYDNEY AU"] },
  { serviceId: "chatgpt-plus", descriptions: ["OPENAI *CHATGPT SUBSCR 415-555-0109 CA"] },
  { serviceId: "duolingo", descriptions: ["DUOLINGO PLUS DUOLINGO.COM PA"] },
  { serviceId: "grammarly", descriptions: ["GRAMMARLY 415-555-0187 CA 0412"] },
  { serviceId: "linkedin-premium", descriptions: ["LINKEDIN PREMIUM 855-555-0123 CA"] },
];

const CLOUD_STORAGE_FIXTURES: readonly KnownServiceFixture[] = [
  { serviceId: "icloud", descriptions: ["APPLE.COM/BILL ICLOUD+ 866-555-0190 CA"] },
  { serviceId: "google-one", descriptions: ["GOOGLE *GOOGLE ONE g.co/helppay#"] },
  { serviceId: "dropbox", descriptions: ["DROPBOX*7K2M9XQ4 DROPBOX.COM CA"] },
];

const NEWS_READING_FIXTURES: readonly KnownServiceFixture[] = [
  { serviceId: "new-york-times", descriptions: ["NYTIMES*NYTIMES.COM 800-555-0171 NY"] },
  { serviceId: "washington-post", descriptions: ["WASHINGTONPOST.COM 800-555-0152 DC"] },
  { serviceId: "wall-street-journal", descriptions: ["WSJ*WALL STREET JOURNAL 800-555-0138 NY"] },
  { serviceId: "the-economist", descriptions: ["THE ECONOMIST 03/04 LONDON GB"] },
  { serviceId: "the-guardian", descriptions: ["GUARDIAN NEWS & MEDIA LONDON GB"] },
  { serviceId: "medium", descriptions: ["MEDIUM.COM 03/07 CA"] },
  { serviceId: "kindle-unlimited", descriptions: ["AMZN DIGITAL*KINDLE UNLIMITED"] },
];

const FITNESS_WELLNESS_FIXTURES: readonly KnownServiceFixture[] = [
  { serviceId: "peloton", descriptions: ["PELOTON MEMBERSHIP 866-555-0147 NY"] },
  { serviceId: "strava", descriptions: ["STRAVA INC 415-555-0162 CA"] },
  { serviceId: "classpass", descriptions: ["CLASSPASS.COM 03/10 NY"] },
  { serviceId: "headspace", descriptions: ["HEADSPACE INC 310-555-0198 CA"] },
  { serviceId: "calm", descriptions: ["CALM.COM 415-555-0116 CA"] },
  { serviceId: "planet-fitness", descriptions: ["PLANET FITNESS 603-555-0149 NH"] },
];

const FOOD_DELIVERY_FIXTURES: readonly KnownServiceFixture[] = [
  { serviceId: "doordash-dashpass", descriptions: ["DOORDASH*DASHPASS 855-555-0173 CA"] },
  { serviceId: "uber-one", descriptions: ["UBER *ONE MEMBERSHIP 04/12 help.uber.com CA"] },
  { serviceId: "grubhub-plus", descriptions: ["GRUBHUB+ 03/06 IL"] },
  { serviceId: "instacart-plus", descriptions: ["INSTACART*INSTACART+ 888-555-0185 CA"] },
  { serviceId: "deliveroo-plus", descriptions: ["DELIVEROO PLUS LONDON GB"] },
  { serviceId: "hellofresh", descriptions: ["HELLOFRESH 646-555-0134 NY 0412"] },
];

const GAMING_FIXTURES: readonly KnownServiceFixture[] = [
  { serviceId: "xbox-game-pass", descriptions: ["MICROSOFT*XBOX GAME PASS 425-681-4800 WA"] },
  { serviceId: "playstation-plus", descriptions: ["PLAYSTATION PLUS 03/08 SONY 800-555-0159 CA"] },
  { serviceId: "nintendo-switch-online", descriptions: ["NINTENDO SWITCH ONLINE 03/03 WA"] },
  { serviceId: "ea-play", descriptions: ["EA PLAY ORIGIN.COM 650-555-0127 CA"] },
];

export const KNOWN_SERVICE_FIXTURES: readonly KnownServiceFixture[] = Object.freeze([
  ...VIDEO_STREAMING_FIXTURES,
  ...MUSIC_AUDIO_FIXTURES,
  ...SOFTWARE_FIXTURES,
  ...CLOUD_STORAGE_FIXTURES,
  ...NEWS_READING_FIXTURES,
  ...FITNESS_WELLNESS_FIXTURES,
  ...FOOD_DELIVERY_FIXTURES,
  ...GAMING_FIXTURES,
]);
