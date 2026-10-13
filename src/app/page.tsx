import { listMatches, type MatchListItem } from "@/lib/data/matches";
import { MatchBoard } from "@/components/match/MatchBoard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let matches: MatchListItem[] = [];
  let loadError: string | null = null;
  try {
    matches = await listMatches();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load matches";
  }

  const upcoming = matches.filter((m) => m.status === "upcoming").length;
  const analysed = matches.filter((m) => m.analysed).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="relative z-10 flex flex-col gap-3">
          <span className="chip w-fit !text-[var(--accent)] !border-[var(--accent)]">Match Day Optimizer</span>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Pick a <span className="text-accent">submittable</span> Dream11 team in one tap.
          </h1>
          <p className="max-w-2xl text-sm text-muted sm:text-base">
            Live squads and conditions, a deterministic scoring engine, an exact optimizer that respects
            every Dream11 rule, and Gemini Flash reasoning for match-specific C/VC calls you can defend to
            your league group — plus a loop that learns from your actual points.
          </p>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            <Stat label="Matches" value={matches.length} />
            <Stat label="Upcoming" value={upcoming} />
            <Stat label="Analysed" value={analysed} />
          </div>
        </div>
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-[var(--accent)] opacity-10 blur-3xl" />
        {/* stadium field motif */}
        <div className="pointer-events-none absolute inset-x-0 -bottom-20 h-44 bg-[radial-gradient(ellipse_at_top,rgba(47,217,138,0.16),transparent_65%)]" />
        <svg
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full"
          aria-hidden
        >
          <ellipse cx="200" cy="150" rx="280" ry="110" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.28" />
          <ellipse cx="200" cy="165" rx="190" ry="85" fill="none" stroke="var(--accent)" strokeWidth="1" strokeDasharray="5 7" opacity="0.2" />
          <line x1="200" y1="60" x2="200" y2="90" stroke="var(--accent)" strokeWidth="1" opacity="0.25" />
        </svg>
      </section>

      {loadError && (
        <div className="card border-[var(--danger)] p-4 text-sm">
          <p className="font-semibold text-[var(--danger)]">Could not load matches</p>
          <p className="text-muted">{loadError}</p>
        </div>
      )}

      <MatchBoard matches={matches} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-xl font-bold text-accent">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
