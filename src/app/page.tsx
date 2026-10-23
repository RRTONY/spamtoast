import type { Metadata } from "next";
import Image from "next/image";
import {
  Shield,
  Sprout,
  Handshake,
  Globe,
  BookOpen,
  Scale,
  Swords,
  AlertTriangle,
  Target,
  Zap,
  ArrowDown,
  TrendingUp,
  Flame,
  Skull,
  ArrowUpRight,
  Trophy,
} from "lucide-react";
import {
  GlassCard,
  SectionLabel,
  SectionTitle,
  SectionIntro,
  PullQuote,
  StatCard,
  CrusadeDivider,
} from "@/components/manifesto/manifesto-ui";
import { OffenderBanner } from "@/components/manifesto/offender-banner";
import { LegalArsenal } from "@/components/manifesto/legal-arsenal";
import { BlockerFinderQuiz } from "@/components/manifesto/blocker-finder-quiz";
import { ReportSpammerForm } from "@/components/manifesto/report-spammer-form";
import { ECONOMICS_DATA, ECONOMICS_SOURCES, WEAPONS, CRUSADE_ARTICLES, TRUST_ARTICLES } from "@/lib/content/attention-theft";
import { WallOfShame } from "@/components/manifesto/wall-of-shame";
import { WALL_OF_SHAME } from "@/lib/content/wall-of-shame";

// The Attention Theft manifesto, spamtoast.com's homepage. Copied from
// tonygreenberg.com's /attention-theft (owner: copy it, keep both,
// 2026-10-24), which is itself the port of legacy
// client/src/pages/manifesto/AttentionTheft.tsx. Copy is unchanged; essay
// links point back to tonygreenberg.com. Additions: the Wall of Shame
// (legacy's own section and wording, fed by src/lib/content/wall-of-shame.ts,
// hidden while empty).
const IMG = {
  hero: "https://cdn.sanity.io/images/a3q1cyqs/production/13ae18ad1316373093f8b66013fdf9c563fccf68-2752x1536.png",
  sacred: "https://cdn.sanity.io/images/a3q1cyqs/production/1dfdc43bd2082682a74d02fe1c4d86e65039128d-1920x1072.webp",
  weapons: "https://cdn.sanity.io/images/a3q1cyqs/production/7ec84601ce457aa4c913fab39891317379bddf03-2752x1536.png",
  legal: "https://cdn.sanity.io/images/a3q1cyqs/production/6bfa9a6149bc89e72de12eb8f8adc113b48a1cdd-2752x1536.png",
  blocker: "https://cdn.sanity.io/images/a3q1cyqs/production/0d70bd9a8365dff14c286f640fbe638b3c7fa01c-1920x1072.webp",
  report: "https://cdn.sanity.io/images/a3q1cyqs/production/16a2b1fedbf99d0689b9ba44ba53c0cff97f4b09-2752x1536.png",
};

export const metadata: Metadata = {
  title: { absolute: "SpamToast | Attention Theft: The Manifesto" },
  description: "The case against attention theft: why your inbox is a crime scene and what to do about it.",
  alternates: { canonical: "/" },
};

const essayHref = (slug: string) => `https://tonygreenberg.com/blog/${slug}`;

function Divider({ src, alt, className = "h-48 md:h-72" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image src={src} alt={alt} fill sizes="100vw" className="object-cover brightness-[0.8] saturate-[1.3] contrast-[1.1]" />
      <div className="absolute inset-0 bg-linear-to-b from-background via-transparent to-background" />
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const offenderRaw = params.offender;
  const offender = Array.isArray(offenderRaw) ? offenderRaw[0] : offenderRaw;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image src={IMG.hero} alt="" fill sizes="100vw" fetchPriority="high" loading="eager" className="object-cover brightness-[0.85] saturate-[1.2] contrast-[1.05]" />
          <div className="absolute inset-0 bg-linear-to-b from-background/40 via-background/15 to-background/95" />
        </div>
        <div className="relative z-10 mx-auto max-w-5xl px-5 py-24 md:py-36">
          <div className="inline-block rounded-2xl border border-white/50 bg-white/75 px-8 py-8 shadow-[0_8px_40px_rgba(0,0,0,0.1)] backdrop-blur-xl md:px-10 md:py-10">
            <SectionLabel>A Manifesto by Tony Greenberg</SectionLabel>
            <h1 className="mb-4 font-heading text-[clamp(32px,7vw,72px)] leading-[1.05] font-bold text-crusade-ink">
              Defend The Cathedral.
              <br />
              <span className="text-crusade-red">Burn The Heresy.</span>
            </h1>
            <p className="mb-6 max-w-2xl text-lg leading-[1.75] text-crusade-brown md:text-xl">
              Email is sacred infrastructure. They&apos;re desecrating it. We&apos;re stopping them.
            </p>
            <div className="mb-6 max-w-3xl rounded-xl border border-crusade-red/15 bg-white/80 px-6 py-5 shadow-[0_4px_24px_rgba(200,22,26,0.08)] backdrop-blur-xl">
              <p className="text-base leading-[1.8] text-crusade-ink md:text-lg">
                This is not a rant. This is a <strong className="text-crusade-red">crusade</strong>. Email is the
                church of modern commerce — the infrastructure that enables human abundance to flow. Spammers are
                committing heresy against it. We don&apos;t just complain. We organize. We build weapons. We
                collapse their economics. <strong className="text-crusade-crimson">We win.</strong>
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <a
                href="#weapons"
                className="inline-flex items-center gap-2 rounded-xl bg-crusade-red px-8 py-4 text-lg font-bold text-white shadow-[0_0_25px_rgba(200,22,26,0.35),0_8px_24px_rgba(0,0,0,0.15)] transition-transform hover:-translate-y-1"
              >
                <Swords size={20} /> Arm Yourself <ArrowDown size={18} />
              </a>
              <a
                href="#report"
                className="inline-flex items-center gap-2 rounded-xl border border-black/12 bg-white/70 px-8 py-4 text-lg font-bold text-crusade-ink backdrop-blur-md transition-transform hover:-translate-y-1"
              >
                <Target size={20} /> Report A Spammer
              </a>
            </div>
          </div>
        </div>
      </section>

      {offender && <OffenderBanner offender={offender} />}

      {/* The Sacred */}
      <Divider src={IMG.sacred} alt="Sacred cathedral interior with golden light" />
      <section className="bg-crusade-warm-white px-5 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>The Sacred</SectionLabel>
          <SectionTitle>What Email Actually Is</SectionTitle>
          <SectionIntro>
            Before we talk about the war, let&apos;s be clear about what we&apos;re protecting. Email isn&apos;t
            just a tool. It&apos;s one of the most profound inventions in human history.
          </SectionIntro>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { Icon: Shield, title: "The Church of Commerce", text: "The sacred space where trust is built, deals are made, relationships are formed, and human abundance flows between strangers who become partners.", colorClass: "text-brand-gold" },
              { Icon: Sprout, title: "The Garden of Opportunity", text: "Where job offers arrive. Where clients say yes. Where old friends reconnect. Where mentors share wisdom. Where lives change direction.", colorClass: "text-crusade-teal" },
              { Icon: Handshake, title: "The Portal to Abundance", text: "Every legitimate email represents someone choosing to invest their attention in another person — an act of trust and genuine human connection.", colorClass: "text-crusade-ember" },
            ].map((card) => (
              <GlassCard key={card.title}>
                <card.Icon size={36} className={`mb-4 ${card.colorClass}`} />
                <h3 className="mb-2 font-heading text-lg font-bold text-crusade-ink">{card.title}</h3>
                <p className="text-base leading-relaxed text-crusade-muted">{card.text}</p>
              </GlassCard>
            ))}
          </div>

          <GlassCard variant="teal" className="mt-12">
            <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
              <Globe size={80} className="text-crusade-teal opacity-70" />
              <div>
                <h3 className="mb-3 font-heading text-2xl font-bold text-crusade-teal">The Great Equalizer</h3>
                <p className="mb-3 text-base leading-[1.8] text-crusade-muted">
                  A person in a village in India can reach a CEO in New York — instantly, for free, with no
                  gatekeeper. A startup founder can pitch a hundred investors in a day.
                </p>
                <p className="text-base leading-[1.8] text-crusade-brown">
                  Before email, communication at scale required money. Email made reach infinite and cost zero.{" "}
                  <strong className="text-crusade-teal">The kid with an idea had the same inbox as the billionaire.</strong>
                </p>
              </div>
            </div>
          </GlassCard>

          <PullQuote>
            &ldquo;Email democratized access. It&apos;s the infrastructure that lets strangers become partners,
            ideas become companies, and individuals become movements.&rdquo;
          </PullQuote>
        </div>
      </section>

      {/* The Heresy */}
      <section id="heresy" className="bg-linear-to-b from-crusade-sand via-crusade-red/4 to-crusade-sand px-5 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>The Heresy</SectionLabel>
          <SectionTitle className="text-crusade-red">What They&apos;re Doing To Our Cathedral</SectionTitle>
          <SectionIntro>
            Every morning I wake up to an inbox that has been violated. Not by colleagues. Not by partners. By
            strangers who decided their need to sell is more important than my need to think, to work, to live.
          </SectionIntro>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard number="$997B" label="Annual Economic Theft" source="Basex Research, inflation-adjusted" />
            <StatCard number="23 min" label="Recovery Per Interruption" source="UC Irvine, Dr. Gloria Mark" />
            <StatCard number="65+ hrs" label="Daily Productivity Destroyed" source="170 spam × 23 min recovery" />
            <StatCard number="45-85%" label="Of All Email Is Spam" source="Industry research composite" />
          </div>

          <PullQuote>
            &ldquo;AI didn&apos;t just give spammers a bigger megaphone. It gave them an industrial-scale
            desecration machine pointed directly at our sacred space.&rdquo;
          </PullQuote>

          <GlassCard variant="danger" glow className="mt-6">
            <div className="flex items-start gap-4">
              <Zap size={32} className="mt-1 shrink-0 text-crusade-red" />
              <div>
                <p className="mb-4 text-lg leading-[1.8] text-crusade-ink">
                  Before AI, a spammer could send maybe 500 personalized emails a day. With AI, a single bad actor
                  can generate <strong className="text-crusade-red">10,000+ unique, personalized spam messages per
                  hour</strong> at zero marginal cost.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-crusade-ember/15 bg-crusade-ember/8 p-4">
                    <TrendingUp size={20} className="mb-2 text-crusade-ember" />
                    <p className="text-sm font-bold text-crusade-ember">Sender Cost</p>
                    <p className="mt-1 font-heading text-3xl font-bold text-crusade-ink">$0.00</p>
                    <p className="mt-1 text-xs text-crusade-muted">Total asymmetry</p>
                  </div>
                  <div className="rounded-xl border border-crusade-red/12 bg-crusade-red/6 p-4">
                    <AlertTriangle size={20} className="mb-2 text-crusade-red" />
                    <p className="text-sm font-bold text-crusade-red">Recipient Cost</p>
                    <p className="mt-1 font-heading text-3xl font-bold text-crusade-ink">23 min</p>
                    <p className="mt-1 text-xs text-crusade-muted">Of irreplaceable life</p>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          <div className="mt-12">
            <h3 className="mb-4 flex items-center gap-2 font-heading text-xl font-bold text-crusade-ink">
              <Scale size={20} className="text-crusade-red" /> Full Economics Breakdown
            </h3>
            <div className="relative overflow-x-auto rounded-2xl border border-crusade-red/15" tabIndex={0} role="region" aria-label="Table (scrolls sideways)">
              <table className="w-full min-w-160 text-left">
                <thead>
                  <tr className="bg-crusade-red/8">
                    <th className="px-5 py-3 font-heading text-sm font-bold text-crusade-ink">Metric</th>
                    <th className="px-5 py-3 text-right font-heading text-sm font-bold text-crusade-ink">Value</th>
                    <th className="px-5 py-3 text-sm font-bold text-crusade-muted">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {ECONOMICS_DATA.map((row, i) => (
                    <tr
                      key={row.metric}
                      className={`border-b border-black/4 ${row.highlight ? "bg-crusade-red/5" : i % 2 === 0 ? "bg-white/50" : "bg-white/30"}`}
                    >
                      <td className="px-5 py-3 text-base leading-relaxed text-crusade-brown">
                        {row.highlight && <AlertTriangle size={14} className="-mt-0.5 mr-2 inline text-crusade-red" />}
                        {row.metric}
                      </td>
                      <td className={`px-5 py-3 text-right font-heading text-lg font-bold whitespace-nowrap ${row.highlight ? "text-crusade-red" : "text-crusade-ink"}`}>
                        {row.value}
                      </td>
                      <td className="px-5 py-3 text-sm text-crusade-muted">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <GlassCard className="mt-8">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wider text-crusade-teal uppercase">
              Key Sources
            </h4>
            <ul className="space-y-2">
              {ECONOMICS_SOURCES.map((s) => (
                <li key={s.text} className="flex items-start gap-2">
                  <ArrowUpRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-crusade-teal/60" />
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm leading-relaxed text-crusade-muted hover:underline">
                      {s.text}
                    </a>
                  ) : (
                    <span className="text-sm leading-relaxed text-crusade-muted">{s.text}</span>
                  )}
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      </section>

      {/* 10 Weapons */}
      <Divider src={IMG.weapons} alt="Gilded weapons arsenal on marble table" />
      <section id="weapons" className="bg-background px-5 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Your Arsenal</SectionLabel>
          <SectionTitle>
            The 10 <span className="text-crusade-red">Weapons</span>
          </SectionTitle>
          <SectionIntro>
            You don&apos;t need to do all ten. But every weapon you deploy makes the economics of spam worse for the
            attacker and better for you. Pick three. Start today.
          </SectionIntro>

          <div className="mt-10 grid gap-5">
            {WEAPONS.map((w, idx) => (
              <GlassCard key={w.num} variant={idx < 3 ? "danger" : "default"} glow={idx === 0} className="relative overflow-hidden">
                <div
                  className={`pointer-events-none absolute top-0 right-4 font-heading text-[7rem] leading-none font-bold select-none ${idx < 3 ? "text-crusade-red/6" : "text-crusade-ink/3"}`}
                >
                  {w.num}
                </div>
                <div className="relative z-10 flex items-start gap-4">
                  <div
                    className={`flex size-14 shrink-0 items-center justify-center rounded-xl border ${
                      idx < 3 ? "border-crusade-red/20 bg-crusade-red/12" : "border-black/6 bg-black/3"
                    }`}
                  >
                    <Flame size={26} className={idx < 3 ? "text-crusade-red" : "text-crusade-ink"} />
                  </div>
                  <div className="flex-1">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${
                        idx < 3 ? "border border-crusade-red/15 bg-crusade-red/10 text-crusade-red" : "border border-black/6 bg-black/3 text-crusade-muted"
                      }`}
                    >
                      Weapon {w.num}
                    </span>
                    <h3 className="mt-2 mb-0.5 font-heading text-xl font-bold text-crusade-ink">{w.title}</h3>
                    <p className="mb-3 text-sm font-medium text-crusade-teal">{w.subtitle}</p>
                    <p className="mb-4 text-base leading-[1.8] text-crusade-muted">{w.desc}</p>
                    <div className="flex items-start gap-2 rounded-xl border border-crusade-red/8 bg-crusade-red/4 p-3">
                      <Flame size={16} className="mt-0.5 shrink-0 text-crusade-ember" />
                      <p className="text-sm font-semibold text-crusade-ink">{w.action}</p>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>

          <PullQuote>
            &ldquo;You don&apos;t have to win the war in a day. You just have to make their economics worse every
            day until the system collapses.&rdquo;
          </PullQuote>
        </div>
      </section>

      {/* Legal Arsenal */}
      <Divider src={IMG.legal} alt="Courtroom with scales of justice" />
      <section id="legal" className="bg-crusade-warm-white px-5 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Legal Framework</SectionLabel>
          <SectionTitle>
            Legal <span className="text-brand-gold">Arsenal</span>
          </SectionTitle>
          <SectionIntro>
            The laws that exist, the laws we need, and how to demand them. The legal infrastructure of attention
            protection is decades behind the technology of attention theft.
          </SectionIntro>
          <LegalArsenal />
        </div>
      </section>

      {/* AI Blocker Finder */}
      <Divider src={IMG.blocker} alt="High-tech command center with threat detection screens" />
      <section id="blocker-finder" className="bg-background px-5 py-20 md:py-28">
        <div className="mx-auto max-w-3xl">
          <SectionLabel>Defense Systems</SectionLabel>
          <SectionTitle>
            AI Blocker <span className="text-crusade-teal">Finder</span>
          </SectionTitle>
          <SectionIntro>Four questions. Personalized arsenal. Find the right weapons to defend your inbox.</SectionIntro>
          <div className="mt-10">
            <BlockerFinderQuiz />
          </div>
        </div>
      </section>

      {/* Wall of Shame */}
      {WALL_OF_SHAME.length > 0 && (
        <section id="wall-of-shame" className="bg-linear-to-b from-crusade-sand via-crusade-red/4 to-crusade-sand px-5 py-20 md:py-28">
          <div className="mx-auto max-w-5xl">
            <SectionLabel>Public Accountability</SectionLabel>
            <SectionTitle>
              The Wall of <span className="text-crusade-red">Shame</span>
            </SectionTitle>
            <p className="mb-8 max-w-2xl text-base leading-[1.7] text-crusade-muted">
              The most-reported attention thieves, ranked by community reports. Every entry is built from real
              submissions. <strong className="text-crusade-red">Spammers: this is your permanent record.</strong>
            </p>
            <WallOfShame entries={WALL_OF_SHAME} />
            <a
              href="#report"
              className="mt-8 inline-flex items-center gap-2 rounded-xl border border-crusade-red/15 bg-crusade-red/10 px-5 py-3 text-sm font-bold text-crusade-red transition-transform hover:-translate-y-0.5"
            >
              <Trophy aria-hidden="true" className="size-3.5" /> Report A Spammer
            </a>
          </div>
        </section>
      )}

      {/* Report a Spammer */}
      <Divider src={IMG.report} alt="Finger pressing brass bell with sparks flying" />
      <section id="report" className="bg-background px-5 py-20 md:py-28">
        <div className="mx-auto max-w-3xl">
          <SectionLabel>Public Accountability</SectionLabel>
          <SectionTitle>
            Report A <span className="text-crusade-red">Spammer</span>
          </SectionTitle>
          <SectionIntro>
            Spammers count on anonymity. A public accountability database is on the roadmap — for now, every report
            goes straight to Tony, reviewed by hand.
          </SectionIntro>
          <div className="mt-10">
            <ReportSpammerForm />
          </div>
        </div>
      </section>

      {/* Join the Crusade */}
      <section className="bg-linear-to-b from-crusade-sand via-crusade-red/8 to-crusade-red/4 px-5 py-20 md:py-28">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <Flame size={72} className="mx-auto mb-6 text-crusade-red" />
            <h2 className="mb-4 font-heading text-[clamp(2rem,6vw,3.5rem)] leading-[1.15] font-bold text-crusade-ink">
              Carry The Baton. <span className="text-crusade-red">Burn The Heresy.</span>
            </h2>
            <p className="font-heading text-lg text-crusade-muted">
              This isn&apos;t about shaming individuals. It&apos;s about collapsing a system.
            </p>
          </div>

          <GlassCard className="mx-auto mb-12 max-w-2xl text-left">
            {[
              "I will not respond.",
              "I will not pick up.",
              "I will make their “marketing” irrelevant.",
              "I will change my email to escape their sewage.",
              "I will send this document to every person who violates my attention.",
              "And I will not stop until the economics of spam collapse entirely.",
            ].map((vow) => (
              <p key={vow} className="mb-3 flex items-start gap-3 font-heading text-lg leading-[1.7] text-crusade-ink last:mb-0">
                <Flame size={16} className="mt-1.5 shrink-0 text-crusade-red/60" />
                <strong>{vow}</strong>
              </p>
            ))}
          </GlassCard>

          <CrusadeDivider />

          <div className="mt-12">
            <SectionLabel>Intelligence Dossier</SectionLabel>
            <h3 className="mb-6 flex items-center gap-2 font-heading text-2xl font-bold text-crusade-red">
              <Target size={20} /> The Crusades — Corporate Accountability
            </h3>
            <div className="mb-10 grid gap-3 sm:grid-cols-2">
              {CRUSADE_ARTICLES.map((a) => (
                <a
                  key={a.slug}
                  href={essayHref(a.slug)}
                  className="flex items-start gap-3 rounded-xl border border-crusade-red/10 bg-crusade-red/4 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <Skull size={16} className="mt-1 shrink-0 text-crusade-red" />
                  <p className="text-sm leading-[1.4] font-semibold text-crusade-ink">{a.title}</p>
                </a>
              ))}
            </div>

            <h3 className="mb-4 flex items-center gap-2 font-heading text-xl font-bold text-crusade-teal">
              <BookOpen size={20} /> Communication &amp; Trust
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {TRUST_ARTICLES.map((a) => (
                <a
                  key={a.slug}
                  href={essayHref(a.slug)}
                  className="flex items-start gap-3 rounded-xl border border-crusade-teal/8 bg-crusade-teal/4 p-4 transition-transform hover:-translate-y-0.5"
                >
                  <BookOpen size={16} className="mt-1 shrink-0 text-crusade-teal" />
                  <p className="text-sm leading-[1.4] font-semibold text-crusade-ink">{a.title}</p>
                </a>
              ))}
            </div>
          </div>

          <PullQuote>
            &ldquo;Every report makes the economics of spam worse for the attacker. You are the enforcement
            mechanism the law forgot to build.&rdquo;
          </PullQuote>
        </div>
      </section>
    </div>
  );
}
