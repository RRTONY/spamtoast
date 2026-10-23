"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

// Ported from legacy client/src/pages/manifesto/AttentionTheft.tsx's
// `?offender=` deep-link banner (by way of tonygreenberg.com). The CTA points
// at the Report section. Reads `?offender=` in the browser so the homepage
// stays pre-built (static) instead of rendering per request.
export function OffenderBanner() {
  return (
    <Suspense fallback={null}>
      <Banner />
    </Suspense>
  );
}

function Banner() {
  const offender = useSearchParams().get("offender");
  const [dismissed, setDismissed] = useState(false);
  if (!offender || dismissed) return null;

  return (
    <section className="relative overflow-hidden border-y-2 border-crusade-red bg-linear-to-r from-crusade-red/6 via-background to-crusade-red/6 px-5 py-8">
      <div className="relative mx-auto max-w-4xl text-center">
        <div className="mb-3 flex items-center justify-center gap-3">
          <AlertTriangle size={28} className="text-crusade-red" />
          <h2 className="font-heading text-2xl font-black tracking-wider text-crusade-red uppercase md:text-3xl">
            {offender}
          </h2>
          <AlertTriangle size={28} className="text-crusade-red" />
        </div>
        <p className="mb-4 text-base leading-relaxed text-crusade-ink md:text-lg">
          Someone sent you this link because <strong className="text-crusade-red">{offender}</strong> has been called
          out for attention theft. This page explains why unsolicited commercial email is destroying the most
          important communication infrastructure in human history — and what to do about it.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a
            href="#report"
            className="inline-flex items-center gap-2 rounded-xl bg-crusade-red px-6 py-3 text-sm font-bold text-white shadow-[0_0_15px_rgba(200,22,26,0.25)] transition-transform hover:-translate-y-0.5"
          >
            Report A Spammer
          </a>
          <button onClick={() => setDismissed(true)} className="text-xs text-crusade-muted/60 underline">
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}
