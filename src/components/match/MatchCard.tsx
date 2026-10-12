import Link from "next/link";
import { CheckCircle2, MapPin } from "lucide-react";
import type { MatchListItem } from "@/lib/data/matches";
import { formatIST, relativeToStart, statusMeta } from "@/lib/format";

function TeamRow({ name, short, logo }: { name: string | null; short: string | null; logo: string | null }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-6 w-6 rounded-full object-cover bg-[var(--surface-3)]" />
      ) : (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--surface-3)] text-[10px] font-bold text-muted">
          {(short || name || "?").slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="truncate text-sm font-semibold">{name ?? "TBD"}</span>
    </div>
  );
}

export function MatchCard({ match }: { match: MatchListItem }) {
  const s = statusMeta(match.status);
  return (
    <Link
      href={`/match/${match.id}`}
      className="card group relative flex flex-col gap-3 p-4 transition hover:border-[var(--accent)] hover:shadow-[0_10px_40px_-20px_var(--accent)]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="chip !text-[var(--text)]">{match.format}</span>
          <span className="chip" style={{ color: s.color, borderColor: s.color }}>
            {match.status === "live" && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: s.color }} />
            )}
            {s.label}
          </span>
        </div>
        {match.analysed && (
          <span className="chip !text-[var(--accent)] !border-[var(--accent)]">
            <CheckCircle2 size={12} /> Analysed
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <TeamRow name={match.teamA} short={match.teamAShort} logo={match.teamALogo} />
        <TeamRow name={match.teamB} short={match.teamBShort} logo={match.teamBLogo} />
      </div>

      {match.series && <p className="truncate text-xs text-muted">{match.series}</p>}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5 text-xs text-muted">
        <span className="flex items-center gap-1 truncate">
          <MapPin size={12} /> {match.venueCity || match.venue || "Venue TBD"}
        </span>
        <span className="whitespace-nowrap">
          {match.status === "completed"
            ? match.resultText?.slice(0, 28) || "Result"
            : `${formatIST(match.startTime)} · ${relativeToStart(match.startTime)}`}
        </span>
      </div>
    </Link>
  );
}
