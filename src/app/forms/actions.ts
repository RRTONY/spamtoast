"use server";

import { esc, sendEmail } from "@/lib/email";
import { SPAM_TYPES } from "@/lib/content/wall-of-shame";

// The "Report A Spammer" form. spamtoast.com has no database (owner,
// 2026-10-24): a report is emailed to Tony, who decides whether the sender
// goes on the Wall of Shame (through the MCP server's add_to_wall_of_shame).
// Same fields and checks as tonygreenberg.com's submitSpamReport. If the
// email can't be sent, the form shows the error with a pre-filled "email
// Tony directly" link, so nothing is lost.

const OWNER_EMAIL = process.env.OWNER_EMAIL || "tony@tonygreenberg.com";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://spamtoast.com";
const UNAVAILABLE = "This couldn't be sent just now. Please try again in a minute.";
const BAD_EMAIL = "That email address doesn't look right.";

export type FormResult = { ok: boolean; error?: string };

const FREQUENCIES: Record<string, string> = {
  "one-time": "One-time",
  weekly: "Weekly",
  daily: "Daily",
  "multiple-daily": "Multiple times per day",
};

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// A plain two-column summary for Tony's email. Empty answers are left out.
export async function emailHtml(intro: string, rows: [string, string | null | undefined][]): Promise<string> {
  const body = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v as string)}</td></tr>`,
    )
    .join("");
  return `<p>${esc(intro)}</p><table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${body}</table><p><a href="${SITE}">${SITE}</a></p>`;
}

export async function submitSpamReport(input: {
  companyName: string;
  senderEmail: string;
  spamType: string;
  frequency: string;
  description: string;
  reporterEmail?: string;
  website?: string; // honeypot
}): Promise<FormResult> {
  if (input.website) return { ok: true };
  const company = clip(input.companyName, 256);
  const sender = clip(input.senderEmail, 320);
  const description = clip(input.description, 5000);
  const reporter = clip(input.reporterEmail, 320);
  if (!company) return { ok: false, error: "Add the company or sender name." };
  if (!isEmail(sender)) return { ok: false, error: "Add the sender's email address." };
  if (!(input.spamType in SPAM_TYPES) || !(input.frequency in FREQUENCIES)) return { ok: false, error: "Pick the type and how often." };
  if (description.length < 10) return { ok: false, error: "Describe what happened in at least 10 characters." };
  if (reporter && !isEmail(reporter)) return { ok: false, error: BAD_EMAIL };
  const sent = await sendEmail(
    OWNER_EMAIL,
    `Spam report: ${company}`,
    await emailHtml(
      "Someone reported a spammer on spamtoast.com. To put them on the Wall of Shame, ask the SpamToast tools to add them (it goes live only after you publish).",
      [
        ["Company / sender", company],
        ["Sender email", sender],
        ["Type", SPAM_TYPES[input.spamType as keyof typeof SPAM_TYPES]],
        ["How often", FREQUENCIES[input.frequency]],
        ["What happened", description],
        ["Reporter email", reporter || "Not given"],
      ],
    ),
  );
  return sent ? { ok: true } : { ok: false, error: UNAVAILABLE };
}
