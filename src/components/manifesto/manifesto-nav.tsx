"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, ChevronLeft, Flame } from "lucide-react";

// Ported from legacy client/src/pages/manifesto/ManifestoLayout.tsx's
// sticky nav — real behavior kept per the migration todo's explicit
// "port ManifestoLayout scroll-tracking wrapper behavior" instruction:
// tracks which section is currently in view and highlights the matching
// nav pill, both on desktop and in the mobile menu. Anchors are plain
// `<a href="#id">` (not a JS scrollIntoView handler) so navigation works
// with JS disabled; smooth scrolling comes from `scroll-smooth` on the
// page's root instead. On spamtoast.com the brand links home and the back
// arrow goes to tonygreenberg.com.
const NAV_ITEMS = [
  { anchor: "", label: "The Manifesto", short: "Home" },
  { anchor: "heresy", label: "Economics of Theft", short: "Economics" },
  { anchor: "blocker-finder", label: "Blocker Finder", short: "Blockers" },
  { anchor: "legal", label: "Legal Arsenal", short: "Legal" },
  { anchor: "weapons", label: "10 Weapons", short: "Weapons" },
  { anchor: "report", label: "Report Spammer", short: "Report" },
];

const SECTION_IDS = ["report", "weapons", "legal", "blocker-finder", "heresy"];

export function ManifestoNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState("");

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 50);
      let found = "";
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) {
          found = id;
          break;
        }
      }
      setActiveAnchor(found);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-crusade-red/10 bg-background/90 backdrop-blur-xl transition-shadow duration-300 ${scrolled ? "shadow-[0_2px_20px_rgba(0,0,0,0.06)]" : ""}`}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
        <a href="https://tonygreenberg.com" aria-label="Back to TonyGreenberg.com" className="flex items-center gap-1.5 text-sm font-medium text-crusade-muted hover:text-crusade-ink min-h-11 md:min-h-6">
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">TonyG</span>
        </a>

        <Link href="/" className="group flex items-center gap-2 min-h-11 md:min-h-6">
          <Flame size={22} className="text-crusade-red transition-transform group-hover:scale-110" />
          <span className="font-heading text-base font-bold tracking-[0.15em] text-crusade-ink uppercase">
            SpamToast
          </span>
        </Link>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="inline-flex items-center rounded-md p-2 text-crusade-ink min-h-11 md:min-h-6"
          aria-label="Toggle navigation"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <nav className="hidden border-t border-black/6 lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-5 py-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.anchor}
              href={item.anchor ? `#${item.anchor}` : "#"}
              className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
                activeAnchor === item.anchor
                  ? "bg-crusade-red text-white shadow-[0_0_15px_rgba(200,22,26,0.3)]"
                  : "text-crusade-muted"
              }`}
            >
              {item.short}
            </a>
          ))}
        </div>
      </nav>

      {menuOpen && (
        <nav className="border-t border-black/6 bg-background/98 backdrop-blur-xl lg:hidden">
          <div className="flex flex-col gap-1 px-5 py-3">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.anchor}
                href={item.anchor ? `#${item.anchor}` : "#"}
                onClick={() => setMenuOpen(false)}
                className={`rounded-md px-3 py-2.5 text-base font-medium ${
                  activeAnchor === item.anchor ? "bg-crusade-red text-white" : "text-crusade-ink"
                }`}
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 border-t border-black/6 pt-2">
              <a
                href="https://tonygreenberg.com"
                className="block px-3 py-2.5 text-sm font-medium text-crusade-muted"
              >
                Back to TonyGreenberg.com
              </a>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
