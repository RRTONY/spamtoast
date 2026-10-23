import { Cormorant_Garamond, Fraunces, Space_Grotesk } from "next/font/google";

// Title faces live uses outside the essays (measured on tonygreenberg.com
// 2026-10-07): Fraunces on Kava, /akbar and /attention-theft (2026-10-09), Space Grotesk on HumanOS,
// Cormorant Garamond on /living-declaration. A page opts in by putting
// `pageFontVariables` on its wrapper and using font-fraunces / font-grotesk /
// font-cormorant; pages that don't import this file never load these fonts.
// (Essays have their own set: essay-fonts.ts.)

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  variable: "--font-fraunces-face",
  display: "swap",
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: false,
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant-face",
  display: "swap",
  preload: false,
});

export const pageFontVariables = `${fraunces.variable} ${spaceGrotesk.variable} ${cormorant.variable}`;
