// Ported from legacy client/src/pages/manifesto/ManifestoLayout.tsx's
// shared UI primitives (GlassCard, SectionLabel, SectionTitle,
// SectionIntro, PullQuote, StatCard, CrusadeDivider). Real
// content/structure unchanged. Two deliberate simplifications, consistent
// with judgment calls made throughout this migration: (1) legacy's
// "Fraunces" serif isn't loaded anywhere else in this app — reused
// `font-heading` (Playfair Display, already loaded) instead of adding a
// ninth webfont for one page, same call already made on `/akbar`. (2) the
// glitch/VHS/ember-particle/shattered-glass decoration layer (a whole
// animation-keyframe library plus randomly-positioned DOM particles) is
// dropped — the same "decoration not worth the cost" judgment already
// applied to canvas particle fields and glitch text elsewhere (see
// `/the-letter`'s own port note). The color/glass-card language itself
// (this page's real "crusade" red/gold-on-parchment identity) is kept, as
// a deliberate one-off sub-brand — same precedent as BrewSoul's own
// distinct palette. `ThreatBadge` was defined in legacy but never
// actually used anywhere in `AttentionTheft.tsx` — dead code, not
// ported.
const GLASS_VARIANT_CLASS: Record<"default" | "danger" | "teal", string> = {
  default: "border border-black/8 bg-white/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)]",
  danger: "border border-crusade-red/20 bg-white/85 shadow-[0_4px_24px_rgba(200,22,26,0.06)]",
  teal: "border border-crusade-teal/20 bg-white/85 shadow-[0_4px_24px_rgba(14,124,124,0.04)]",
};

const GLASS_VARIANT_GLOW_CLASS: Record<"default" | "danger" | "teal", string> = {
  default: "border border-black/8 bg-white/80 shadow-[0_0_25px_rgba(200,22,26,0.1)]",
  danger: "border border-crusade-red/20 bg-white/85 shadow-[0_0_30px_rgba(200,22,26,0.12)]",
  teal: "border border-crusade-teal/20 bg-white/85 shadow-[0_0_25px_rgba(14,124,124,0.1)]",
};

export function GlassCard({
  children,
  className = "",
  variant = "default",
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "danger" | "teal";
  glow?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-6 backdrop-blur-xl transition-all md:p-8 ${glow ? GLASS_VARIANT_GLOW_CLASS[variant] : GLASS_VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`mb-3 inline-block text-xs font-bold tracking-[0.3em] text-crusade-red uppercase ${className}`}>
      {children}
    </span>
  );
}

export function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={`mb-4 font-heading text-[clamp(28px,5vw,56px)] leading-[1.1] font-bold text-crusade-ink ${className}`}
    >
      {children}
    </h2>
  );
}

export function SectionIntro({ children }: { children: React.ReactNode }) {
  return <p className="max-w-2xl text-lg leading-[1.8] text-crusade-muted">{children}</p>;
}

export function PullQuote({ children, className = "border-l-crusade-red" }: { children: React.ReactNode; className?: string }) {
  return (
    <blockquote
      className={`my-10 max-w-3xl border-l-[3px] pl-6 font-heading text-xl leading-[1.6] text-crusade-brown md:text-2xl ${className}`}
    >
      {children}
    </blockquote>
  );
}

export function StatCard({ number, label, source }: { number: string; label: string; source: string }) {
  return (
    <div className="rounded-2xl border border-crusade-red/15 bg-white/85 p-6 text-center shadow-[0_4px_24px_rgba(200,22,26,0.06)] backdrop-blur-xl">
      <div className="mb-2 font-heading text-[clamp(2.5rem,6vw,4rem)] leading-none font-bold text-crusade-red">
        {number}
      </div>
      <div className="text-base font-medium text-crusade-ink">{label}</div>
      <div className="mt-2 text-xs text-crusade-muted">{source}</div>
    </div>
  );
}

export function CrusadeDivider() {
  return (
    <div className="relative mx-auto my-10 h-0.5 max-w-50">
      <div className="absolute inset-0 bg-linear-to-r from-transparent via-crusade-red to-transparent" />
      <div className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-crusade-red shadow-[0_0_8px_var(--crusade-red)]" />
    </div>
  );
}
