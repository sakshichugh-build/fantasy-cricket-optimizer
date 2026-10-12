"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search } from "lucide-react";
import type { MatchListItem } from "@/lib/data/matches";
import type { MatchFormat } from "@/lib/types";
import { MatchCard } from "./MatchCard";

const FORMATS: (MatchFormat | "ALL")[] = ["ALL", "T20", "ODI", "TEST", "T10"];
const STATUSES = ["all", "upcoming", "live", "completed"] as const;

export function MatchBoard({ matches }: { matches: MatchListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("ALL");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (format !== "ALL" && m.format !== format) return false;
      if (status !== "all" && m.status !== status) return false;
      if (q && !`${m.name} ${m.teamA} ${m.teamB} ${m.venue}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [matches, format, status, q]);

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/matches/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(data.error || "Sync failed — check the cricket API key.");
      } else {
        setSyncMsg(
          `Synced ${data.synced} matches${data.stale ? " (served from cache)" : ""}${
            data.info?.hitsToday != null ? ` · ${data.info.hitsToday}/${data.info.hitsLimit ?? "?"} API hits today` : ""
          }`,
        );
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className="btn !px-3 !py-1.5 text-xs"
              style={
                format === f
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : { background: "var(--surface-2)", color: "var(--muted)", borderColor: "var(--line)" }
              }
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={sync} disabled={syncing} className="btn btn-primary text-sm">
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync live matches"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="chip capitalize"
              style={status === s ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search team / venue"
            className="w-48 rounded-lg border border-line bg-[var(--surface-2)] py-1.5 pl-8 pr-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {syncMsg && <p className="text-xs text-muted">{syncMsg}</p>}

      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <p className="font-display text-lg font-semibold">No matches yet</p>
          <p className="max-w-md text-sm text-muted">
            {matches.length === 0
              ? "Hit “Sync live matches” to pull upcoming and recent fixtures from the cricket API."
              : "No matches match these filters."}
          </p>
        </div>
      ) : (
        <div
          className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${pending ? "opacity-60" : ""}`}
        >
          {filtered.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
