import Link from "next/link";
import { Flame } from "lucide-react";

// Ported from legacy client/src/pages/manifesto/ManifestoLayout.tsx's
// footer. Real content unchanged; the site links go to tonygreenberg.com.
export function ManifestoFooter() {
  return (
    <footer className="relative overflow-hidden bg-linear-to-b from-crusade-sand to-crusade-warm-white px-5 py-16 text-center text-crusade-ink">
      <Flame size={32} className="mx-auto mb-4 text-crusade-red" />
      <p className="mb-1 font-heading text-xl font-bold text-crusade-ink">Tony Greenberg</p>
      <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-crusade-muted">
        Founder &amp; CEO, ImpactSoul · Co-Founder, RampRate · 25 Years Building Fortune 500 Efficiency
      </p>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-5">
        <a href="https://tonygreenberg.com" className="text-sm text-crusade-muted hover:text-crusade-ink">
          TonyGreenberg.com
        </a>
        <a href="https://tonygreenberg.com/blog" className="text-sm text-crusade-muted hover:text-crusade-ink">
          Essays
        </a>
        <Link href="/" className="text-sm font-semibold text-crusade-red">
          The Manifesto
        </Link>
      </div>
      <div className="mx-auto max-w-md border-t border-black/8 pt-6">
        <p className="text-xs text-crusade-muted/60">
          © {new Date().getFullYear()} Tony Greenberg. This manifesto may be freely shared.{" "}
          <strong className="text-crusade-red">That&apos;s the point.</strong>
        </p>
      </div>
    </footer>
  );
}
