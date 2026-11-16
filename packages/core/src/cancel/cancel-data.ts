// Cancel database. Data only: never built from or fetched from any external source (Req 1.8).
// Every lastChecked stays null until the human step of tasks.md opens the URLs (Req 6.12).
import type { AppStoreLink, AppStoreLinks, CancelEntry, EmailOnlyService } from "./types.js";

function cancelEntry(entry: CancelEntry): CancelEntry {
  return Object.freeze({
    ...entry,
    providerDomains: Object.freeze([...entry.providerDomains]),
    regionalUrls: Object.freeze({ ...entry.regionalUrls }),
    steps: Object.freeze([...entry.steps]),
  });
}

function emailOnly(record: EmailOnlyService): EmailOnlyService {
  return Object.freeze({ ...record });
}

function appStoreLink(link: AppStoreLink): AppStoreLink {
  return Object.freeze({ ...link, providerDomains: Object.freeze([...link.providerDomains]) });
}

export const APP_STORE_LINKS: AppStoreLinks = Object.freeze({
  apple: appStoreLink({
    label: "Apple subscriptions",
    url: "https://support.apple.com/en-us/118428",
    providerDomains: ["apple.com"],
  }),
  google: appStoreLink({
    label: "Google Play subscriptions",
    url: "https://play.google.com/store/account/subscriptions",
    providerDomains: ["google.com"],
  }),
});

/** Sorted by serviceId in code-unit order (Req 1.3). */
export const CANCEL_ENTRIES: readonly CancelEntry[] = Object.freeze([
  // --- Batch 1: 1password … crunchyroll ---
  cancelEntry({
    serviceId: "1password",
    providerDomains: ["1password.com"],
    url: "https://support.1password.com/cancel-membership/",
    kind: "help",
    regionalUrls: {},
    steps: [
      "Sign in to your account on the 1Password website.",
      "Open Billing and choose Cancel subscription.",
    ],
    appStoreMayApply: false,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "adobe",
    providerDomains: ["adobe.com"],
    url: "https://account.adobe.com/plans",
    kind: "manage",
    regionalUrls: {},
    steps: [
      "Sign in and open Plans.",
      "Choose Manage plan on the plan to end.",
      "Select Cancel your plan and confirm.",
    ],
    appStoreMayApply: false,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "amazon-music",
    providerDomains: ["amazon.com"],
    url: "https://music.amazon.com/settings",
    kind: "manage",
    regionalUrls: {},
    steps: [
      "Sign in and open Settings.",
      "Choose Amazon Music Unlimited.",
      "Select Cancel subscription and confirm.",
    ],
    appStoreMayApply: true,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "amazon-prime",
    providerDomains: ["amazon.com", "amazon.co.uk"],
    url: "https://www.amazon.com/mc",
    kind: "manage",
    regionalUrls: { UK: "https://www.amazon.co.uk/mc" },
    steps: [
      "Sign in and open Your Prime Membership.",
      "Choose Manage Membership.",
      "Select End Membership and confirm.",
    ],
    appStoreMayApply: false,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "apple-music",
    providerDomains: ["apple.com"],
    url: "https://support.apple.com/en-us/118428",
    kind: "help",
    regionalUrls: {},
    steps: [
      "Open Settings on your iPhone and tap your name.",
      "Tap Subscriptions and choose Apple Music.",
      "Tap Cancel Subscription and confirm.",
    ],
    appStoreMayApply: true,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "apple-tv-plus",
    providerDomains: ["apple.com"],
    url: "https://support.apple.com/en-us/118428",
    kind: "help",
    regionalUrls: {},
    steps: [
      "Open Settings on your iPhone and tap your name.",
      "Tap Subscriptions and choose Apple TV+.",
      "Tap Cancel Subscription and confirm.",
    ],
    appStoreMayApply: true,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "audible",
    providerDomains: ["audible.com"],
    url: "https://www.audible.com/account/overview",
    kind: "manage",
    regionalUrls: {},
    steps: [
      "Sign in and open Account Details.",
      "Choose Cancel membership.",
      "Follow the prompts and confirm.",
    ],
    appStoreMayApply: false,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "calm",
    providerDomains: ["calm.com"],
    url: "https://support.calm.com/hc/en-us",
    kind: "help",
    regionalUrls: {},
    steps: [
      "Search the help center for Cancel subscription.",
      "Follow the steps for the store that bills you.",
    ],
    appStoreMayApply: true,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "canva",
    providerDomains: ["canva.com"],
    url: "https://www.canva.com/settings/billing-and-teams",
    kind: "manage",
    regionalUrls: {},
    steps: [
      "Sign in and open Billing and plans.",
      "Choose Cancel subscription on your plan.",
      "Confirm the cancellation.",
    ],
    appStoreMayApply: true,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "chatgpt-plus",
    providerDomains: ["openai.com"],
    url: "https://help.openai.com/en/articles/6950777-how-do-i-cancel-my-chatgpt-subscription",
    kind: "help",
    regionalUrls: {},
    steps: [
      "Sign in to ChatGPT and open your profile menu.",
      "Choose My plan, then Manage subscription.",
      "Select Cancel plan and confirm.",
    ],
    appStoreMayApply: true,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "classpass",
    providerDomains: ["classpass.com"],
    url: "https://help.classpass.com/hc/en-us",
    kind: "help",
    regionalUrls: {},
    steps: [
      "Search the help center for Cancel membership.",
      "Follow the steps for your membership.",
    ],
    appStoreMayApply: true,
    lastChecked: null,
  }),
  cancelEntry({
    serviceId: "crunchyroll",
    providerDomains: ["crunchyroll.com"],
    url: "https://www.crunchyroll.com/account/membership",
    kind: "manage",
    regionalUrls: {},
    steps: [
      "Sign in and open Membership Info.",
      "Choose Cancel Membership.",
      "Confirm the cancellation.",
    ],
    appStoreMayApply: true,
    lastChecked: null,
  }),
]);

/** Sorted by serviceId in code-unit order (Req 1.3). */
export const EMAIL_ONLY_SERVICE_IDS: readonly EmailOnlyService[] = Object.freeze([
  // emailOnly({ serviceId: "…", reason: "Cancels only in person or by post.", lastChecked: null }),
]);

// `emailOnly` is used from the batch that writes the first email-only id (planet-fitness).
void emailOnly;
