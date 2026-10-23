import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-28 text-center">
      <Flame aria-hidden="true" className="mx-auto mb-6 size-12 text-crusade-red" />
      <h1 className="mb-4 font-heading text-4xl font-bold text-crusade-ink">Page not found</h1>
      <p className="mb-8 text-lg text-crusade-muted">This page doesn&apos;t exist. The manifesto does.</p>
      <Link href="/" className="inline-flex items-center gap-1.5 rounded-xl bg-crusade-red px-6 py-3 font-bold text-white">
        Read The Manifesto <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </section>
  );
}
