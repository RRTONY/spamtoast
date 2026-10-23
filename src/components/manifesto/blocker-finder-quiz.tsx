"use client";

import { useState } from "react";
import { ChevronRight, ExternalLink, Star } from "lucide-react";
import { GlassCard, SectionLabel } from "@/components/manifesto/manifesto-ui";
import { QUESTIONS, scoreTools } from "@/lib/content/attention-theft";

// Ported from legacy client/src/pages/manifesto/AttentionTheft.tsx's "AI
// Blocker Finder" — a 4-question quiz that scores 8 real email-defense
// tools against the reader's platform/volume/spam-type/tech-level
// answers. Real content/scoring logic unchanged, no backend dependency
// (legacy's version was already pure client-side state).
function getThreatLevel(volume: string | undefined) {
  if (volume === "extreme") return { label: "CRITICAL", colorClass: "text-crusade-red border-crusade-red bg-crusade-red/12", desc: "Your inbox has been overrun. Immediate action required." };
  if (volume === "high") return { label: "HIGH", colorClass: "text-crusade-ember border-crusade-ember bg-crusade-ember/12", desc: "Your inbox is actively under siege." };
  return { label: "MODERATE", colorClass: "text-brand-gold border-brand-gold bg-brand-gold/12", desc: "Your inbox is under pressure but manageable." };
}

export function BlockerFinderQuiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<ReturnType<typeof scoreTools> | null>(null);

  const answer = (qId: string, value: string) => {
    const next = { ...answers, [qId]: value };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) setStep(step + 1);
    else setResults(scoreTools(next));
  };

  const reset = () => {
    setStep(0);
    setAnswers({});
    setResults(null);
  };

  if (!results) {
    return (
      <>
        <div className="mb-8 flex items-center gap-2">
          {QUESTIONS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? "bg-crusade-teal" : "bg-black/6"}`} />
          ))}
        </div>
        <div className="mb-2 text-center">
          <span className="text-xs font-bold tracking-wider text-crusade-teal uppercase">
            Question {step + 1} of {QUESTIONS.length}
          </span>
        </div>
        <h3 className="mb-8 text-center font-heading text-2xl font-bold text-crusade-ink md:text-3xl">
          {QUESTIONS[step].question}
        </h3>
        <div className="grid gap-3">
          {QUESTIONS[step].options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => answer(QUESTIONS[step].id, opt.value)}
              className="w-full rounded-xl border border-black/6 bg-white/60 p-5 text-left transition-transform hover:-translate-y-0.5"
            >
              <span className="flex items-center justify-between">
                <span className="text-base font-medium text-crusade-brown">{opt.label}</span>
                <ChevronRight size={18} className="text-crusade-teal/40" />
              </span>
            </button>
          ))}
        </div>
      </>
    );
  }

  const threat = getThreatLevel(answers.volume);

  return (
    <>
      <div className="mb-8 text-center">
        <SectionLabel>Threat Assessment Complete</SectionLabel>
        <div className={`mb-4 inline-block rounded-full border-2 px-6 py-2 text-xl font-bold ${threat.colorClass}`}>
          THREAT LEVEL: {threat.label}
        </div>
        <p className="text-lg text-crusade-muted">{threat.desc}</p>
      </div>
      <h3 className="mb-6 font-heading text-2xl font-bold text-crusade-ink">Your Personalized Arsenal</h3>
      <div className="grid gap-4">
        {results.map((tool, i) => (
          <GlassCard key={tool.name} variant={i === 0 ? "danger" : "teal"} glow={i === 0}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${
                      i === 0 ? "bg-crusade-red/10 text-crusade-red" : "bg-crusade-teal/10 text-crusade-teal"
                    }`}
                  >
                    {i === 0 ? "TOP PICK" : `#${i + 1}`}
                  </span>
                  <span className="text-sm font-medium text-crusade-muted">{tool.price}</span>
                </div>
                <h4 className="mb-1 font-heading text-xl font-bold text-crusade-ink">{tool.name}</h4>
                <p className="mb-2 text-base leading-relaxed text-crusade-muted">{tool.desc}</p>
                <div className="mt-2 flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} size={16} className={s < tool.rating ? "fill-brand-gold text-brand-gold" : "text-black/10"} />
                  ))}
                </div>
              </div>
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-xl border border-crusade-teal/20 bg-crusade-teal/10 p-3 transition-transform hover:scale-105"
              >
                <ExternalLink size={18} className="text-crusade-teal" />
              </a>
            </div>
          </GlassCard>
        ))}
      </div>
      <div className="mt-6 text-center">
        <button onClick={reset} className="text-sm font-medium text-crusade-teal/60 hover:underline">
          Retake Assessment
        </button>
      </div>
    </>
  );
}
