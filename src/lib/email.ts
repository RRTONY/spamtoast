import "server-only";

// Sender for every site email. Same Resend sender as tonygreenberg.com (verified
// there) until spamtoast.com is verified in Resend; then set EMAIL_FROM.
const DEFAULT_FROM = "Only Time Buys Trust <trust@tonygreenberg.com>";

export interface EmailAttachment {
  filename: string;
  content: string; // base64
}

// Extras the MCP server's send_email / create_report tools need (2026-10-16).
// Every site form leaves them out, so their emails are unchanged.
export interface EmailOptions {
  text?: string;
  from?: string;
  attachments?: EmailAttachment[];
}

// Sends one email through Resend's HTTP API (no SDK, no new dependency).
// Needs RESEND_API_KEY. Returns false instead of throwing, so a mail hiccup
// never breaks the page.
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  options: EmailOptions = {},
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = options.from || process.env.EMAIL_FROM || DEFAULT_FROM;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set; email not sent:", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        ...(options.text ? { text: options.text } : {}),
        ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      }),
    });
    if (!res.ok) console.warn("[email] Resend refused:", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.warn("[email] send failed:", err);
    return false;
  }
}

// Escapes text placed into an email's HTML.
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
