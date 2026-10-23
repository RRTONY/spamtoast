"use client";

import { useState } from "react";
import { Copy, CheckCircle, Filter, Globe, Megaphone, Scale, ArrowRight } from "lucide-react";
import { GlassCard, PullQuote } from "@/components/manifesto/manifesto-ui";
import { LAWS, LETTER_TEMPLATE, type LawStatus } from "@/lib/content/attention-theft";

// Ported from legacy client/src/pages/manifesto/AttentionTheft.tsx's Legal
// Arsenal section — status filter, per-law expand/collapse, and a
// copy-to-clipboard letter template. Real content/logic unchanged. No
// backend dependency (this was always pure client-side in legacy).
const FILTERS: { label: string; value: LawStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Existing Law", value: "existing" },
  { label: "Take Action", value: "action" },
];

const STATUS_STYLES: Record<LawStatus, { badgeClass: string; iconClass: string; label: string; icon: typeof Scale }> = {
  existing: { badgeClass: "bg-crusade-teal/10 text-crusade-teal border border-crusade-teal/30", iconClass: "text-crusade-teal", label: "Existing Law", icon: Scale },
  action: { badgeClass: "bg-crusade-red/6 text-crusade-red border border-crusade-red/30", iconClass: "text-crusade-red", label: "Take Action", icon: Megaphone },
};

export function LegalArsenal() {
  const [filter, setFilter] = useState<LawStatus | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filteredLaws = filter === "all" ? LAWS : LAWS.filter((l) => l.status === filter);

  const copyLetter = async () => {
    await navigator.clipboard.writeText(LETTER_TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="mt-8 mb-6 flex flex-wrap items-center gap-2">
        <Filter size={16} className="text-crusade-muted" />
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              filter === f.value ? "border-crusade-ink bg-crusade-ink text-white" : "border-black/6 bg-black/3 text-crusade-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filteredLaws.map((law) => {
          const s = STATUS_STYLES[law.status];
          const Icon = s.icon;
          const isExpanded = expanded === law.title;
          return (
            <GlassCard key={law.title} variant={law.status === "action" ? "danger" : "default"} glow={law.status === "action"}>
              <div className="flex items-start gap-4">
                <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${s.badgeClass}`}>
                  <Icon size={22} className={s.iconClass} />
                </div>
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${s.badgeClass}`}>
                      {s.label}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-crusade-muted">
                      <Globe size={12} />
                      {law.jurisdiction}
                    </span>
                  </div>
                  <h3 className="mb-2 font-heading text-lg font-bold text-crusade-ink">{law.title}</h3>
                  <p className="text-base leading-relaxed text-crusade-muted">{law.summary}</p>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : law.title)}
                    className={`mt-3 text-sm font-medium hover:underline ${s.iconClass}`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {isExpanded ? "Show less" : "Read full analysis"}
                      {!isExpanded && <ArrowRight aria-hidden="true" className="size-[1em] shrink-0" />}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="mt-4 border-t border-black/6 pt-4">
                      <p className="text-base leading-relaxed text-crusade-brown">{law.detail}</p>
                      {law.actionUrl && (
                        <a
                          href={law.actionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-crusade-red px-5 py-3 text-sm font-bold text-white shadow-[0_0_20px_rgba(200,22,26,0.3)] transition-transform hover:-translate-y-0.5"
                        >
                          <Megaphone size={16} /> Take Action Now
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <PullQuote className="border-l-brand-gold">
        &ldquo;The CAN-SPAM Act is 20 years old. It was written before AI, before the attention economy, before spam
        became a trillion-dollar theft operation. It&apos;s time for legislation with real teeth.&rdquo;
      </PullQuote>

      <div className="mt-8">
        <h3 className="mb-4 flex items-center gap-2 font-heading text-xl font-bold text-crusade-red">
          <Megaphone size={20} /> Letter to Your Representative
        </h3>
        <div className="relative">
          <button
            onClick={copyLetter}
            className={`absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-transform hover:scale-105 ${
              copied ? "border-crusade-teal/15 bg-crusade-teal/15 text-crusade-teal" : "border-black/8 bg-black/4 text-crusade-ink"
            }`}
          >
            {copied ? (
              <>
                <CheckCircle size={12} /> Copied
              </>
            ) : (
              <>
                <Copy size={12} /> Copy
              </>
            )}
          </button>
          <div className="rounded-2xl border border-black/6 bg-white/50 p-6 font-mono text-[0.85rem] leading-relaxed whitespace-pre-line text-crusade-ink md:p-8">
            {LETTER_TEMPLATE}
          </div>
        </div>
      </div>
    </div>
  );
}
