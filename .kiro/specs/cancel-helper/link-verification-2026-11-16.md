# Task 23 — link verification results (Claude Code, 2026-11-16)

Every URL below was opened in headless Chromium (Playwright) on 2026-11-16; "VERIFIED" means the page loaded on the provider's own domain and was either the cancel/manage page, the provider's sign-in page returning to it, or a help article whose title is about cancelling. Steps marked NEW come from that article's text.

Apply to `packages/core/src/cancel/cancel-data.ts`. Keep the file sorted, keep every other field as is. Set `lastChecked: "2026-11-16"` on every VERIFIED entry and both App-store links. Leave `lastChecked: null` on the UNVERIFIED entries.

## Unchanged URL, VERIFIED (only set lastChecked)

adobe, amazon-music, amazon-prime (incl. UK), apple-music, apple-tv-plus, canva, crunchyroll, dazn, deezer, deliveroo-plus, dropbox, expressvpn, google-one, grammarly, grubhub-plus, kindle-unlimited (incl. UK), linkedin-premium, medium, netflix, new-york-times, nordvpn, sling-tv, spotify, the-economist, the-guardian, youtube-music, youtube-premium, uber-one (URL changes, see below), APP_STORE_LINKS apple + google.

## Changed URL, VERIFIED (set url, kind, steps exactly as given; lastChecked "2026-11-16")

| serviceId | url | kind | steps |
| --- | --- | --- | --- |
| 1password | https://support.1password.com/manage-subscription/ | help | "Sign in on the 1Password website and open Billing." / "Choose Cancel subscription and confirm." |
| calm | https://support.calm.com/hc/en-us/articles/115002473607-How-to-Cancel-Your-Subscription-or-Free-Trial | help | "Sign in on the Calm website and open your profile." / "Choose Settings, then Manage Subscription." / "Select Cancel and confirm." |
| chatgpt-plus | https://help.openai.com/en/articles/7232927-canceling-your-chatgpt-subscription | help | "Sign in to ChatGPT and open Settings from your profile menu." / "Open Billing." / "Under Cancel plan, select Cancel." |
| classpass | https://help.classpass.com/hc/en-us/articles/204578119-How-do-I-cancel-my-ClassPass-membership | help | "Sign in on the ClassPass website and open Account." / "Open Settings and choose Cancel your membership." / "Follow the prompts and keep the confirmation email." |
| discovery-plus | https://help.discoveryplus.com/hc/en-us/articles/32717623804311-Cancel-discovery | help | "Sign in on the discovery+ website and open your profile menu." / "Open Subscription and choose Cancel." / "If there is no cancel option, cancel with the company that bills you." |
| doordash-dashpass | https://help.doordash.com/en-us/consumers/article/how-do-i-cancel-my-dashpass-subscription | help | "Sign in and open Account, then Manage DashPass." / "Choose the cancel option." / "Confirm the cancellation." |
| duolingo | https://www.duolingo.com/help/cancel-my-super-duolingo-subscription | help | "Sign in on the Duolingo website and open Settings." / "Choose Super Duolingo." / "Select Cancel subscription and confirm." |
| espn-plus | https://support.espn.com/hc/en-us/articles/40377550796308-Cancelling-Your-ESPN-Select-or-Unlimited-Subscription | help | "Sign in to ESPN and open Account." / "Choose Manage Subscription." / "Select Cancel on your plan and confirm." |
| headspace | https://help.headspace.com/hc/en-us/articles/115008364988-How-do-I-cancel-my-subscription | help | "Sign in on the Headspace website, not the app." / "Open your subscription settings." / "Choose Cancel subscription and confirm." |
| icloud | https://support.apple.com/en-us/108318 | help | "Open Settings on your iPhone and tap your name." / "Tap Subscriptions, then iCloud+." / "Choose a smaller plan or cancel, and confirm." |
| instacart-plus | https://www.instacart.com/help/section/107169420/423178048 | help | "Sign in and open the account menu." / "Choose Instacart+ membership, then Cancel membership." / "Select Continue to confirm." |
| microsoft-365 | https://support.microsoft.com/en-us/accounts-billing/subscriptions/cancel-a-microsoft-365-subscription | help | "Sign in to your Microsoft account and open Services & subscriptions." / "Find Microsoft 365 and choose Cancel subscription." / "Follow the prompts to confirm." |
| nintendo-switch-online | https://en-americas-support.nintendo.com/app/answers/detail/a_id/41196 | help | "Sign in to your Nintendo Account on the website." / "Open Nintendo Switch Online." / "Turn off automatic renewal at least 48 hours before it ends." |
| pandora | https://help.pandora.com/s/article/Cancel-your-Subscription-1519949295562?language=en_US | help | "Sign in on the Pandora website and open Settings." / "Choose Subscription, then Switch Plans." / "Select Cancel Subscription and confirm." |
| paramount-plus | https://help.paramountplus.com/s/article/PI-How-do-I-cancel-my-subscription | help | "Sign in on the Paramount+ website and open Account." / "Choose Cancel Subscription." / "Follow the prompts to confirm." |
| playstation-plus | https://www.playstation.com/en-us/support/subscriptions/cancel-playstation-plus/ | help | "Sign in to Account Management." / "Choose Subscription." / "Select Cancel Subscription next to PlayStation Plus." |
| siriusxm | https://www.siriusxm.com/help/manage-or-cancel-service | help | "Sign in to the Online Account Center." / "Open the Subscriptions tab and choose to cancel." / "If the option is missing, use chat or call Listener Care." |
| strava | https://support.strava.com/en-us/articles/15401936-how-do-i-cancel-my-subscription | help | "Sign in on the Strava website and open Settings." / "Choose My Account, then Cancel Subscription." / "Confirm the cancellation." |
| tidal | https://support.tidal.com/hc/en-us/articles/201314601-Cancel-Tidal-Subscription-or-Trial | help | "Sign in to your TIDAL account on the website." / "Open Subscription." / "Choose Cancel Subscription and confirm." |
| uber-one | https://help.uber.com/en/riders/article/how-can-i-cancel-my-uber-one-membership?nodeId=8f62fc7a-6cc9-4ac7-a59a-3f5627bf616c | help | keep the current steps |
| washington-post | https://helpcenter.washingtonpost.com/hc/en-us/articles/360000177571-How-to-cancel-your-digital-only-subscription | help | "Sign in and open your My Post profile." / "Choose Manage subscription." / "Select Cancel and confirm." |
| xbox-game-pass | https://support.xbox.com/en-US/help/subscriptions-billing/manage-subscriptions/cancel-recurring-billing-or-subscription | help | keep the current steps; providerDomains becomes ["microsoft.com", "xbox.com"] |

## UNVERIFIED (could not be opened from the checker's network: US-only geo-block or bot wall). lastChecked stays null.

URLs come from each provider's own site via search results; set them as given.

| serviceId | url | kind | steps | why unverified |
| --- | --- | --- | --- | --- |
| audible | https://www.audible.com/help/article/cancel-membership | help | keep current steps | audible.com redirects the checker's region to audible.in |
| disney-plus | keep current | keep | keep | redirects the checker's region to hotstar.com |
| ea-play | https://help.ea.com/en/articles/ea-account/how-to-cancel-ea-play/ | help | "Sign in to your EA Account." / "Open Subscriptions and Memberships." / "Choose Cancel membership and confirm." | HTTP/2 bot wall |
| hellofresh | https://www.hellofresh.com/about/how-to-cancel-hellofresh-subscription, regionalUrls UK https://www.hellofresh.co.uk/about/how-to-cancel-hellofresh | help | "Sign in and open Account Settings, then Plan Settings." / "Choose Cancel Plan in the Status section." / "Follow the prompts before the weekly cutoff." | bot wall (403) |
| hulu | keep current | keep | keep | bot wall (406) |
| max | https://www.hbomax.com/subscription (Max is now HBO Max; providerDomains ["hbomax.com"]) | manage | "Sign in on the HBO Max website and open Subscription." / "Choose Cancel Your Subscription." / "If there is no cancel option, cancel with the company that bills you." | US-only geo-block |
| peacock | https://www.peacocktv.com/help/article/cancellation | help | "Sign in on the Peacock website and open Account." / "Open the Subscriptions tab." / "Choose to cancel all subscriptions and confirm." | US-only geo-block |
| peloton | keep current | keep | keep | support site needs sign-in (401) |
| wall-street-journal | keep current | keep | keep | bot wall (403) |
