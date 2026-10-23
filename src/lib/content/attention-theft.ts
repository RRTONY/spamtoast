// Ported from legacy client/src/pages/manifesto/AttentionTheft.tsx's
// module-level data (economics stats, the 10 weapons, the legal arsenal,
// the AI Blocker Finder quiz + tool catalog + scoring, and the related-
// reading link lists). Real content, unchanged — split out to its own
// content module so both the server page and the client islands
// (legal-arsenal, blocker-finder-quiz) can import it without a
// Client→Server export boundary issue (same pattern already hit and
// fixed on the peptide pages elsewhere in this migration).

export const ECONOMICS_DATA = [
  { metric: "Average emails/day (knowledge worker)", value: "121", source: "Radicati Group, 2023", highlight: false },
  { metric: "Average emails/day (executives)", value: "200+", source: "Radicati Group, 2023", highlight: false },
  { metric: "Percentage of email that is spam", value: "45–85%", source: "Industry composite", highlight: true },
  { metric: "Recovery time per interruption", value: "23 min 15 sec", source: "Dr. Gloria Mark, UC Irvine", highlight: true },
  { metric: "Increase in task completion time", value: "+50%", source: "Mark et al., 2008", highlight: false },
  { metric: "Increase in errors after interruption", value: "+50%", source: "Mark et al., 2008", highlight: false },
  { metric: "Percentage of workweek spent on email", value: "28%", source: "McKinsey Global Institute", highlight: true },
  { metric: "Hours/year lost to email management", value: "582 hours", source: "McKinsey, derived", highlight: false },
  { metric: "Value at $200/hr executive rate", value: "$116,400/yr stolen", source: "Per executive, per year", highlight: true },
  { metric: "Annual U.S. economic cost of interruptions", value: "$588 Billion", source: "Basex Research, 2005", highlight: false },
  { metric: "Inflation-adjusted cost (2025 estimate)", value: "$997+ Billion", source: "Basex, CPI-adjusted", highlight: true },
  { metric: "AI spam capacity per bad actor", value: "10,000+ msgs/hr", source: "Industry estimate", highlight: true },
  { metric: "Marginal cost to sender", value: "$0.00", source: "Total asymmetry", highlight: true },
  { metric: "Cost to recipient per message", value: "23 min of life", source: "Dr. Gloria Mark", highlight: false },
];

export const ECONOMICS_SOURCES = [
  { text: 'Dr. Gloria Mark, UC Irvine — "The Cost of Interrupted Work" (2008)', url: "https://www.ics.uci.edu/~gmark/chi08-mark.pdf" },
  { text: "Radicati Group — Email Statistics Report, 2023", url: "https://www.radicati.com" },
  { text: "McKinsey Global Institute — The Social Economy (2012)", url: "https://www.mckinsey.com" },
  { text: "Basex Research — Information Overload Cost Study (2005)", url: undefined },
];

export const WEAPONS = [
  { num: "01", title: "Never Respond", subtitle: "The Zero-Engagement Protocol", desc: "Every response — even \"unsubscribe\" — validates their model. It confirms a live address, an engaged human, a potential mark. The first weapon is absolute silence.", action: "Delete without opening. Mark as spam. Move on." },
  { num: "02", title: "Deploy AI Blockers", subtitle: "Fight Fire With Fire", desc: "If they're using AI to attack, use AI to defend. Tools like SaneBox, Clean Email, and Superhuman use machine learning to identify and quarantine spam before it reaches your attention.", action: "Take the Blocker Finder quiz below." },
  { num: "03", title: "Use Email Aliases", subtitle: "The Disposable Identity Strategy", desc: "Services like SimpleLogin and AnonAddy let you create unlimited email aliases. Give each service a unique alias. When one gets compromised, kill it.", action: "Set up SimpleLogin or AnonAddy today." },
  { num: "04", title: "Public Shame", subtitle: "Name Them. Document Them.", desc: "Spammers operate in the dark. They count on anonymity. Screenshot it, name the company, share it publicly. Make the social cost of spamming higher than the economic benefit.", action: "Use the Report form below." },
  { num: "05", title: "Time-Block Your Inbox", subtitle: "Reclaim Your Attention", desc: "Check email twice a day. Not continuously. Set specific windows — 10am and 3pm — and close your email client the rest of the time.", action: "Set two email windows today." },
  { num: "06", title: "Report to Authorities", subtitle: "Make It Official", desc: "File complaints with the FTC, the FCC, and your state attorney general. Volume of complaints drives regulatory action. Be the volume.", action: "File at reportfraud.ftc.gov" },
  { num: "07", title: "Share This Manifesto", subtitle: "Carry The Baton", desc: "Every person who reads this and acts reduces the ROI of spam by one more unit. Share it with your team, your company, your network.", action: "Send this page to 5 people drowning in spam." },
  { num: "08", title: "Demand Better Laws", subtitle: "The Legislative Front", desc: "The CAN-SPAM Act is a joke — it doesn't even require opt-in consent. Demand legislation modeled on GDPR and CASL. Real penalties. Real enforcement.", action: "Use the letter template in Legal Arsenal below." },
  { num: "09", title: "Organize Your Company", subtitle: "Institutional Defense", desc: "Deploy enterprise-grade spam filtering. Train your team on the economics of attention theft. Make \"inbox defense\" part of your operational culture.", action: "Propose an email hygiene policy at your next meeting." },
  { num: "10", title: "Change Your Email", subtitle: "The Nuclear Option", desc: "If your current email is beyond saving, start fresh. Migrate to a new address with strict alias protocols from day one.", action: "Consider Hey.com or Proton Mail for a fresh start." },
];

// The two invented "(Proposed)" federal bills were removed 2026-10-13 (owner).
export type LawStatus = "existing" | "action";
export const LAWS: { title: string; jurisdiction: string; status: LawStatus; summary: string; detail: string; actionUrl?: string }[] = [
  { title: "CAN-SPAM Act (2003)", jurisdiction: "United States", status: "existing", summary: "Requires opt-out mechanism, honest headers, physical address. Penalties up to $51,744 per violation.", detail: "The CAN-SPAM Act sets rules for commercial email but does NOT require prior consent (opt-in), making it one of the weakest anti-spam laws among developed nations." },
  { title: "GDPR (2018)", jurisdiction: "European Union", status: "existing", summary: "Requires explicit prior consent. Fines up to €20M or 4% of global revenue.", detail: "Requires affirmative, unambiguous consent before sending marketing communications. The gold standard — and the model the U.S. should adopt." },
  { title: "CCPA / CPRA (2020/2023)", jurisdiction: "California, USA", status: "existing", summary: "Right to know, delete, and opt-out of data sales. Fines up to $7,500 per intentional violation.", detail: "Gives consumers the right to know what data is collected, delete it, and opt out of its sale. Provides tools to cut off the data brokers who fuel spam." },
  { title: "CASL (2014)", jurisdiction: "Canada", status: "existing", summary: "Requires express consent. Penalties up to $10M per violation.", detail: "One of the strictest in the world. Requires express consent (opt-in) for commercial electronic messages with severe penalties." },
  { title: "Contact Your Representatives", jurisdiction: "United States", status: "action", summary: "Write to your congressional representatives demanding stronger anti-spam legislation.", detail: "The CAN-SPAM Act is 20+ years old. It needs to be replaced with legislation that treats attention theft as the economic crime it is.", actionUrl: "https://www.congress.gov/members/find-your-member" },
];

export const LETTER_TEMPLATE = `Dear [Representative Name],

I am writing to urge you to support stronger federal legislation addressing unsolicited commercial email and AI-powered spam. The CAN-SPAM Act of 2003 is woefully outdated and fails to protect American workers and businesses from what has become a nearly $1 trillion annual economic theft.

Research from UC Irvine shows each email interruption costs 23 minutes of recovery time. With AI enabling bad actors to send 10,000+ personalized spam messages per hour at zero cost, the asymmetry is catastrophic. The sender pays nothing. The recipient pays with their life.

I urge you to support legislation that: (1) requires explicit opt-in consent for all commercial email, (2) mandates disclosure of AI-generated communications, (3) establishes meaningful per-violation penalties, and (4) creates a private right of action for recipients.

Respectfully,
[Your Name]`;

export const QUESTIONS = [
  { id: "platform", question: "What email platform do you primarily use?", options: [
    { label: "Gmail / Google Workspace", value: "gmail" },
    { label: "Outlook / Microsoft 365", value: "outlook" },
    { label: "Apple Mail / iCloud", value: "apple" },
    { label: "Other (ProtonMail, Fastmail, etc.)", value: "other" },
  ] },
  { id: "volume", question: "How many unwanted emails do you receive per day?", options: [
    { label: "Under 20", value: "low" },
    { label: "20–50", value: "medium" },
    { label: "50–100", value: "high" },
    { label: "100+", value: "extreme" },
  ] },
  { id: "type", question: "What type of spam bothers you most?", options: [
    { label: "Cold outreach / sales pitches", value: "sales" },
    { label: "Newsletter subscriptions I never signed up for", value: "newsletters" },
    { label: "Phishing / scam attempts", value: "phishing" },
    { label: "All of the above equally", value: "all" },
  ] },
  { id: "tech", question: "How technical are you?", options: [
    { label: "I just want it to work", value: "basic" },
    { label: "Comfortable with settings and filters", value: "moderate" },
    { label: "I can configure DNS records and API integrations", value: "advanced" },
    { label: "I build software", value: "developer" },
  ] },
];

export const TOOLS = [
  { name: "SaneBox", url: "https://www.sanebox.com", desc: "AI-powered email triage. Moves unimportant emails to a separate folder. Learns your priorities.", platforms: ["gmail", "outlook", "apple", "other"], techLevel: ["basic", "moderate", "advanced", "developer"], bestFor: ["sales", "newsletters", "all"], rating: 5, price: "$7/mo" },
  { name: "Unroll.me", url: "https://unroll.me", desc: "Mass unsubscribe from newsletters. See all subscriptions in one view and kill them.", platforms: ["gmail", "outlook", "apple"], techLevel: ["basic", "moderate"], bestFor: ["newsletters", "all"], rating: 4, price: "Free" },
  { name: "Clean Email", url: "https://clean.email", desc: "Bulk email management with smart rules. Auto-clean, unsubscribe, and organize at scale.", platforms: ["gmail", "outlook", "apple", "other"], techLevel: ["basic", "moderate", "advanced"], bestFor: ["sales", "newsletters", "all"], rating: 4, price: "$10/mo" },
  { name: "Hey.com", url: "https://hey.com", desc: "Basecamp's radical email rethink. Screener blocks unknown senders. The Feed separates newsletters.", platforms: ["other"], techLevel: ["basic", "moderate", "advanced", "developer"], bestFor: ["sales", "newsletters", "phishing", "all"], rating: 5, price: "$99/yr" },
  { name: "Proton Mail", url: "https://proton.me/mail", desc: "End-to-end encrypted email. Swiss privacy laws. Built-in spam filtering with zero data harvesting.", platforms: ["other"], techLevel: ["moderate", "advanced", "developer"], bestFor: ["phishing", "sales", "all"], rating: 5, price: "Free / $4/mo" },
  { name: "MailWasher", url: "https://www.mailwasher.net", desc: "Preview and delete spam before it reaches your inbox. Bounce spam back to sender.", platforms: ["gmail", "outlook", "apple", "other"], techLevel: ["moderate", "advanced"], bestFor: ["sales", "phishing", "all"], rating: 3, price: "$40/yr" },
  { name: "SimpleLogin / AnonAddy", url: "https://simplelogin.io", desc: "Email alias service. Create unlimited aliases. When one gets spammed, kill it.", platforms: ["gmail", "outlook", "apple", "other"], techLevel: ["advanced", "developer"], bestFor: ["sales", "newsletters", "phishing", "all"], rating: 5, price: "Free / $4/mo" },
  { name: "Superhuman", url: "https://superhuman.com", desc: "The fastest email experience. AI triage, split inbox, keyboard-first for high-volume professionals.", platforms: ["gmail", "outlook"], techLevel: ["moderate", "advanced", "developer"], bestFor: ["sales", "all"], rating: 4, price: "$30/mo" },
];

export function scoreTools(answers: Record<string, string>) {
  return TOOLS.map((tool) => {
    let score = 0;
    if (tool.platforms.includes(answers.platform)) score += 3;
    if (tool.techLevel.includes(answers.tech)) score += 2;
    if (tool.bestFor.includes(answers.type)) score += 2;
    if (answers.volume === "extreme" && ["SaneBox", "Hey.com", "Superhuman"].includes(tool.name)) score += 2;
    if (answers.volume === "high" && tool.name === "Clean Email") score += 1;
    return { ...tool, score };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export const CRUSADE_ARTICLES = [
  { slug: "the-restaurant-with-no-menu-prices-ai-ethics-manifesto", title: "Zuck: Fix This Now & Stop Lying to Congress" },
  { slug: "california-toll-roads-legalized-scam", title: "California Toll Roads: A Legalized Scam" },
  { slug: "the-1000-hour-hold", title: "The $1,000/Hour Hold" },
  { slug: "forward-health-is-a-sideway-step-at-best", title: "Forward Health Is a Sideway Step at Best" },
  { slug: "bread-stuck-with-no-customer-service", title: "Lodge Bread: Stuck With No Customer Service" },
  { slug: "trap-how-dmn8-gym-became-a-poster-child-for-fitness-fraud", title: "DMN8: Poster Child for Fitness Fraud" },
  { slug: "hiding-fees-tips-in-the-transparent-age", title: "Hiding Fees & Tips in the Transparent Age" },
  { slug: "luz-lounge-where-loyalty-goes-to-die-groupon", title: "Luz Lounge: Where Loyalty Goes to Die" },
];

export const TRUST_ARTICLES = [
  { slug: "the-decay-of-modern-day-communication", title: "The Decay of Modern Day Communication" },
  { slug: "only-time-buys-trust", title: "Only Time Buys Trust" },
  { slug: "why-good-service-is-all-about-trust", title: "Why Good Service Is All About Trust" },
  { slug: "customer-service-key-to-business-success", title: "Customer Service: Key to Business Success" },
];
