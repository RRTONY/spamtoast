import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { headers } from "next/headers";
import { AlertTriangle, ArrowRight, ArrowUpRight, Ban, BookOpen, Flame, Mail, Scale, ShieldCheck } from "lucide-react";
import { GlassCard, PullQuote, SectionIntro, SectionLabel, SectionTitle } from "@/components/manifesto/manifesto-ui";
import { LAWS } from "@/lib/content/attention-theft";
import { ALTERNATIVES, BOT_USER_AGENT, LINKEDIN_BAN_CASES, REPORT_PLACES } from "@/lib/content/youve-been-reported";
import { verifyConfrontParams, type ConfrontTarget } from "@/lib/spam/confront-link";
import { esc, sendEmail } from "@/lib/email";

// The page a spammer lands on from a personal link made by the MCP server's
// create_confrontation_link tool. Honest version of legacy
// YouveBeenReported.tsx (see src/lib/content/youve-been-reported.ts for what
// was kept and dropped). A link whose signature checks out names the
// company and emails Tony that it was opened; any other visit shows the
// generic page and notifies nobody. Never indexed (next.config.ts header +
// robots below).

export const metadata: Metadata = {
  title: "You've Been Reported",
  description: "This sender has been reported for attention theft: unsolicited commercial email.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/youve-been-reported" },
};

const OWNER_EMAIL = process.env.OWNER_EMAIL || "tony@tonygreenberg.com";

async function notifyOpened(target: ConfrontTarget) {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  if (!ua || BOT_USER_AGENT.test(ua)) return;
  const when = new Date().toUTCString();
  after(() =>
    sendEmail(
      OWNER_EMAIL,
      `Opened: ${target.company} saw their SpamToast notice`,
      `<p>Someone opened the "You've been reported" link for <strong>${esc(target.company)}</strong>.</p>
<p>Domain: ${esc(target.domain ?? "not given")}<br>Email: ${esc(target.email ?? "not given")}<br>When: ${esc(when)}<br>Browser: ${esc(ua.slice(0, 200))}</p>
<p>Every open sends one of these, so a few in a row usually means they looked more than once.</p>`,
    ),
  );
}

export default async function YouveBeenReportedPage({ searchParams }: PageProps<"/youve-been-reported">) {
  const target = verifyConfrontParams(await searchParams);
  if (target) await notifyOpened(target);
  const who = target?.company;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-crusade-ink px-5 py-20 text-white md:py-28">
        <div className="absolute inset-0 bg-linear-to-b from-crusade-red/25 via-transparent to-crusade-ink" />
        <div className="relative mx-auto max-w-4xl text-center">
          <AlertTriangle aria-hidden="true" className="mx-auto mb-6 size-14 text-crusade-red" />
          <p className="mb-3 font-mono text-xs tracking-[0.3em] text-[#E07A80] uppercase">Notice of Attention Theft</p>
          <h1 className="mb-6 font-heading text-[clamp(2.25rem,7vw,4.5rem)] leading-[1.05] font-black">
            {who ? (
              <>
                <span className="text-[#E07A80]">{who}</span>, you&apos;ve been reported.
              </>
            ) : (
              <>You&apos;ve been reported.</>
            )}
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-[1.75] text-white/85 md:text-xl">
            {who ? (
              <>
                Tony Greenberg received unsolicited commercial email from <strong className="text-white">{who}</strong>
                {target?.domain ? <> ({target.domain})</> : null}. It has been recorded as attention theft, and Tony
                has been told that this notice was opened.
              </>
            ) : (
              <>
                Someone sent you this page because they received unsolicited commercial email from you. It has been
                recorded as attention theft.
              </>
            )}
          </p>
        </div>
      </section>

      {/* You broke into my house */}
      <section className="bg-crusade-warm-white px-5 py-20 md:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 font-heading text-[clamp(1.75rem,5vw,3rem)] leading-[1.1] font-bold text-crusade-ink">
            You <span className="text-crusade-red">Broke Into</span> My House
          </h2>
          <div className="space-y-4 text-lg leading-[1.8] text-crusade-brown">
            <p>
              My inbox is my home. My email is my church. {who ? <strong className="text-crusade-ink">{who}</strong> : "You"}{" "}
              didn&rsquo;t knock. {who ? "They" : "You"} didn&rsquo;t ask. {who ? "They" : "You"} kicked in the door,
              sat down at my table, and started selling me things I never asked for.
            </p>
            <p>
              That&rsquo;s not marketing. That&rsquo;s <strong className="text-crusade-red">trespassing</strong>. And
              now it&rsquo;s on the record.
            </p>
          </div>
        </div>
      </section>

      {/* What this means */}
      <section className="bg-background px-5 py-20 md:py-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>What Happens Now</SectionLabel>
          <SectionTitle>What This Notice Means</SectionTitle>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <GlassCard>
              <ShieldCheck aria-hidden="true" className="mb-4 size-8 text-crusade-teal" />
              <h3 className="mb-2 font-heading text-lg font-bold text-crusade-ink">It&apos;s on file</h3>
              <p className="text-base leading-relaxed text-crusade-muted">
                The email you sent has been logged as unsolicited commercial email, with your company name and
                sending address.
              </p>
            </GlassCard>
            <GlassCard>
              <Ban aria-hidden="true" className="mb-4 size-8 text-crusade-red" />
              <h3 className="mb-2 font-heading text-lg font-bold text-crusade-ink">Repeat senders go public</h3>
              <p className="text-base leading-relaxed text-crusade-muted">
                Senders who keep at it can be added to the public{" "}
                <Link href="/#wall-of-shame" className="font-semibold text-crusade-red underline underline-offset-2">
                  Wall of Shame
                </Link>
                , ranked by how often they&apos;re reported.
              </p>
            </GlassCard>
            <GlassCard>
              <Mail aria-hidden="true" className="mb-4 size-8 text-crusade-ember" />
              <h3 className="mb-2 font-heading text-lg font-bold text-crusade-ink">How to make it stop</h3>
              <p className="text-base leading-relaxed text-crusade-muted">
                Remove this address from every list, sequence and tool you use, and don&apos;t sell or share it. No
                reply is needed.
              </p>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* Where spam gets reported */}
      <section className="bg-linear-to-b from-crusade-sand via-crusade-red/4 to-crusade-sand px-5 py-20 md:py-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Enforcement</SectionLabel>
          <SectionTitle>Where Spam Gets Reported</SectionTitle>
          <SectionIntro>
            Anyone who receives unwanted commercial email can report it to these organizations. Mail providers and
            blocklists use those reports to decide what reaches an inbox.
          </SectionIntro>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {REPORT_PLACES.map((p) => (
              <li key={p.name}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full items-start gap-3 rounded-xl border border-black/8 bg-white/70 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <ArrowUpRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-crusade-red" />
                  <span>
                    <span className="block text-base font-bold text-crusade-ink">{p.name}</span>
                    <span className="block font-mono text-[11px] tracking-wider text-crusade-teal uppercase">{p.scope}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-crusade-muted">{p.what}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The law */}
      <section className="bg-background px-5 py-20 md:py-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Legal Framework</SectionLabel>
          <SectionTitle>
            The Laws on <span className="text-brand-gold">Commercial Email</span>
          </SectionTitle>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {LAWS.filter((l) => l.status === "existing").map((law) => (
              <GlassCard key={law.title}>
                <div className="mb-2 flex items-center gap-2">
                  <Scale aria-hidden="true" className="size-5 text-brand-gold" />
                  <h3 className="font-heading text-lg font-bold text-crusade-ink">{law.title}</h3>
                </div>
                <p className="mb-2 font-mono text-[11px] tracking-wider text-crusade-teal uppercase">{law.jurisdiction}</p>
                <p className="text-base leading-relaxed text-crusade-muted">{law.summary}</p>
              </GlassCard>
            ))}
          </div>
          <Link href="/#legal" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-crusade-red">
            The full Legal Arsenal <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      </section>

      {/* LinkedIn */}
      <section className="bg-crusade-ink px-5 py-20 text-white md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 font-mono text-xs tracking-[0.2em] text-[#E07A80] uppercase">Platforms Act Too</p>
          <h2 className="mb-4 font-heading text-[clamp(1.75rem,5vw,3rem)] leading-[1.1] font-bold">
            What LinkedIn Does To Spammers
          </h2>
          <p className="mb-8 max-w-3xl text-lg leading-[1.8] text-white/80">
            Every connection — gone. Every recommendation — erased. Every job listing, every recruiter conversation,
            every warm intro, every deal in your pipeline — <strong className="text-white">vaporized overnight</strong>.
            LinkedIn doesn&rsquo;t warn you. One day you log in and it says:{" "}
            <em className="text-[#E07A80]">&ldquo;Your account has been permanently restricted.&rdquo;</em>
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {LINKEDIN_BAN_CASES.map((c) => (
              <a
                key={c.name}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-crusade-red/30 bg-white/5 p-5 transition-transform hover:-translate-y-0.5"
              >
                <p className="mb-2 font-bold text-white">{c.name}</p>
                <p className="mb-3 text-sm leading-relaxed text-white/75">&ldquo;{c.detail}&rdquo;</p>
                <p className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-[#E07A80] uppercase">
                  {c.source} <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </p>
              </a>
            ))}
          </div>
          <h3 className="mt-14 mb-4 font-heading text-2xl font-bold">
            And If {who ? "They" : "You"} Think AI Will <span className="text-[#E07A80]">Save</span> {who ? "Them" : "You"}?
          </h3>
          <p className="max-w-3xl text-lg leading-[1.8] text-white/80">
            It won&rsquo;t. AI-generated spam is still spam. Personalizing it with GPT doesn&rsquo;t make it
            welcome — it makes it <em>premeditated</em>.
          </p>
        </div>
      </section>

      {/* Alternatives */}
      <section className="bg-crusade-warm-white px-5 py-20 md:py-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>A Better Way</SectionLabel>
          <SectionTitle>Legitimate Ways To Find Customers</SectionTitle>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ALTERNATIVES.map((a) => (
              <a
                key={a.title}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-crusade-teal/15 bg-white/70 p-5 transition-transform hover:-translate-y-0.5"
              >
                <p className="mb-2 inline-flex items-center gap-1.5 font-bold text-crusade-ink">
                  {a.title} <ArrowUpRight aria-hidden="true" className="size-3.5 text-crusade-teal" />
                </p>
                <p className="text-sm leading-relaxed text-crusade-muted">{a.desc}</p>
              </a>
            ))}
          </div>
          <PullQuote>
            &ldquo;Every report makes the economics of spam worse for the attacker. You are the enforcement mechanism
            the law forgot to build.&rdquo;
          </PullQuote>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-crusade-red px-6 py-3 text-base font-bold text-white transition-transform hover:-translate-y-0.5"
            >
              <Flame aria-hidden="true" className="size-4" /> Read The Manifesto
            </Link>
            <a
              href="https://tonygreenberg.com/blog"
              className="inline-flex items-center gap-2 rounded-xl border border-black/12 bg-white px-6 py-3 text-base font-bold text-crusade-ink transition-transform hover:-translate-y-0.5"
            >
              <BookOpen aria-hidden="true" className="size-4" /> Tony&apos;s Essays
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
