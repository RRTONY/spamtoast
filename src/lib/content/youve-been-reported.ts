// Content for /youve-been-reported, the page a spammer lands on from a
// personal link. Honest version of legacy
// client/src/pages/manifesto/YouveBeenReported.tsx (owner, 2026-10-24):
// legacy animated "filed" checkmarks next to agencies, showed a fake
// invoice and claimed named executives would get a copy, none of which
// happened. Here every claim is true. Kept from legacy: where spam can be
// reported (the same official links, shown as places anyone can file, not
// as filings), the LinkedIn ban stories (real, sourced), and the honest
// alternatives. Legacy's own wording kept where it's opinion or metaphor.

export interface ReportPlace {
  name: string;
  scope: string;
  what: string;
  url: string;
}

export const REPORT_PLACES: ReportPlace[] = [
  { name: "Federal Trade Commission (FTC)", scope: "United States", what: "Deceptive or unwanted commercial email under the CAN-SPAM Act.", url: "https://reportfraud.ftc.gov/" },
  { name: "Spamhaus Project", scope: "International", what: "Blocklists used by mail providers to stop spam sources.", url: "https://www.spamhaus.org/blocklists/" },
  { name: "SpamCop", scope: "International", what: "Reports a spam message's source to its network and to blocklists.", url: "https://www.spamcop.net/anonsignup.shtml" },
  { name: "Internet Crime Complaint Center (IC3)", scope: "United States, FBI", what: "Fraud or scams that arrive by email.", url: "https://www.ic3.gov/" },
  { name: "Google Safe Browsing", scope: "Global", what: "Phishing or deceptive websites linked from an email.", url: "https://safebrowsing.google.com/safebrowsing/report_phish/" },
  { name: "Microsoft", scope: "Global", what: "Unsafe websites, for Edge, Outlook and Microsoft 365.", url: "https://www.microsoft.com/en-us/wdsi/support/report-unsafe-site-guest" },
  { name: "Your State Attorney General", scope: "United States", what: "Consumer protection complaints under state law.", url: "https://www.naag.org/find-my-ag/" },
  { name: "Canadian Anti-Fraud Centre", scope: "Canada", what: "Spam and fraud under Canada's Anti-Spam Legislation (CASL).", url: "https://www.antifraudcentre-centreantifraude.ca/report-signalez-eng.htm" },
  { name: "ICANN Compliance", scope: "International", what: "Abuse complaints about a sending domain, through its registrar.", url: "https://www.icann.org/compliance/complaint" },
  { name: "LinkedIn", scope: "Global", what: "Spam and unwanted messages sent on LinkedIn.", url: "https://www.linkedin.com/help/linkedin/answer/a1339364" },
  { name: "Better Business Bureau (BBB)", scope: "United States & Canada", what: "A public complaint about a business's practices.", url: "https://www.bbb.org/file-a-complaint" },
];

export const LINKEDIN_BAN_CASES = [
  {
    name: "Solo Consultant",
    detail: "Permanently banned after 12 years and 30,000+ followers. Zero explanation. 'For a solo-consulting business, it would have killed me.' Couldn't even create a new account — personally blacklisted.",
    source: "Blake Harber, Substack",
    url: "https://blakeharber.substack.com/p/i-was-permanently-banned-from-linkedin",
  },
  {
    name: "Agency CEO",
    detail: "Agency ran campaigns using a CEO's personal account. Got restricted. 5,000+ connections built over years — investors, partners, active customers. All gone. Agency lost the client immediately. Reputation destroyed.",
    source: "LinkedSDR Report",
    url: "https://www.linkedsdr.com/blog/what-happens-when-linkedin-bans-your-account",
  },
  {
    name: "SaaS Sales Rep",
    detail: "Lost sales LinkedIn account with 8 months of connections and active deals. Entire pipeline evaporated overnight. Every conversation, every warm lead, every follow-up — gone.",
    source: "Reddit r/SaaS",
    url: "https://www.reddit.com/r/SaaS/comments/1qdpm49/my_sales_linkedin_account_got_banned_2_months_ago/",
  },
  {
    name: "Content Creator",
    detail: "Banned from LinkedIn 6 times. 'Your entire work network, resume, and career experience can be wiped from existence.' No appeal. No explanation. No mercy.",
    source: "Tim Denning, Medium",
    url: "https://medium.com/swlh/i-just-got-banned-from-linkedin-for-the-6th-time-697babe24d61",
  },
];

export const ALTERNATIVES = [
  { title: "Content Marketing", desc: "Create valuable content that attracts customers organically. No inbox invasion required.", url: "https://contentmarketinginstitute.com/" },
  { title: "Inbound Marketing (HubSpot Academy)", desc: "Free certification. Learn to attract, engage, and delight customers without spam.", url: "https://academy.hubspot.com/courses/inbound-marketing" },
  { title: "LinkedIn Thought Leadership", desc: "Post valuable insights. Build a following. Let customers come to you.", url: "https://www.linkedin.com/pulse/" },
  { title: "SEO & Organic Search", desc: "Rank for what your customers are searching for. Sustainable, ethical, effective.", url: "https://moz.com/beginners-guide-to-seo" },
  { title: "Community Building", desc: "Build a community around your product. Trust > interruption.", url: "https://www.commsor.com/" },
  { title: "Referral Programs", desc: "Let happy customers bring you new ones. The only marketing that scales with trust.", url: "https://www.referralcandy.com/" },
];

// Link previewers and mail scanners open links before a person does; their
// visits don't count as "they opened it".
export const BOT_USER_AGENT = /bot|crawl|spider|preview|slurp|facebookexternalhit|embedly|proofpoint|mimecast|barracuda|scanner|headless|curl|wget|python-requests/i;
