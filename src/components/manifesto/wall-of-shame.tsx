import { SPAM_TYPES, rankedWall, type WallEntry } from "@/lib/content/wall-of-shame";

// The ranked Wall of Shame list, from legacy AttentionTheft.tsx's
// `wallData.map(...)` block. Legacy read it from a live database
// (trpc.spam.wallOfShame); here it's the reviewed list in
// src/lib/content/wall-of-shame.ts, so it's in the server HTML and there's
// no reveal button or loading state. Top three keep legacy's red / ember /
// gold rank colours.
const RANK_BADGE = ["bg-crusade-red text-white", "bg-crusade-ember text-white", "bg-brand-gold text-white"];
const RANK_ROW = ["border-crusade-red bg-crusade-red/4", "border-crusade-ember bg-crusade-red/4", "border-brand-gold bg-crusade-red/4"];
const RANK_COUNT = ["text-crusade-red", "text-crusade-ember", "text-brand-gold"];

export function WallOfShame({ entries }: { entries: WallEntry[] }) {
  return (
    <ol className="space-y-3">
      {rankedWall(entries).map((entry, i) => (
        <li
          key={`${entry.company}-${entry.domain ?? ""}`}
          className={`flex items-center gap-4 rounded-xl border p-4 md:p-5 ${RANK_ROW[i] ?? "border-black/6 bg-white/60"}`}
        >
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg font-heading text-lg font-black ${RANK_BADGE[i] ?? "bg-black/4 text-crusade-ink"}`}
          >
            {i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-crusade-ink">{entry.company}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-crusade-muted">
              <span className="rounded-full border border-crusade-red/12 bg-crusade-red/8 px-2 py-0.5 text-crusade-red">
                {SPAM_TYPES[entry.spamType]}
              </span>
              {entry.domain && <span>{entry.domain}</span>}
              <span>Since {entry.firstReported}</span>
            </div>
            {entry.note && <p className="mt-2 text-sm leading-relaxed text-crusade-muted">{entry.note}</p>}
          </div>
          <div className="shrink-0 text-right">
            <div className={`font-heading text-2xl font-black ${RANK_COUNT[i] ?? "text-crusade-red"}`}>{entry.reports}</div>
            <div className="font-mono text-[10px] tracking-wider text-crusade-muted uppercase">
              {entry.reports === 1 ? "report" : "reports"}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
