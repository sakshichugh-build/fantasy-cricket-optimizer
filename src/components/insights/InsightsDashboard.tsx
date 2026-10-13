"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { RefreshCw, TrendingUp, Check, X, RotateCcw, Sparkles, Target } from "lucide-react";
import type { InsightsDashboard as Dash, SegmentAccuracy } from "@/lib/insights/metrics";

const C_PRED = "#5b8def";
const C_ACT = "#27e07a";
const C_BAR = "#ff9a3d";

export function InsightsDashboard({ data }: { data: Dash }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(url: string, body?: unknown, key?: string) {
    setBusy(key || url);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "Action failed");
      else {
        if (url.includes("compute")) setMsg(`Analyzed ${d.observations} player outcomes → ${d.insights} patterns`);
        else if (url.includes("apply")) setMsg(d.action === "apply" ? `Applied → weights v${d.newVersion}` : "Dismissed");
        else if (url.includes("rollback")) setMsg(`Rolled back to v${d.activeVersion}`);
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => post("/api/insights/compute", undefined, "compute")} disabled={busy === "compute"} className="btn btn-primary text-sm">
          <RefreshCw size={15} className={busy === "compute" ? "animate-spin" : ""} /> Recompute insights
        </button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>

      {!data.hasData ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Target className="text-accent" />
          <p className="font-display text-lg font-semibold">No completed data yet</p>
          <p className="max-w-md text-sm text-muted">
            Analyse a match, enter the actual Dream11 points after it finishes, then recompute. The
            dashboard fills with accuracy trends and weight suggestions once there are results.
          </p>
        </div>
      ) : (
        <>
          {/* overview */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Player outcomes" value={String(data.totalObservations)} />
            <Tile label="Mean abs error" value={`${data.overall.mae.toFixed(1)} pts`} accent />
            <Tile
              label="Overall bias"
              value={
                data.overall.bias === "over"
                  ? "Over-rating"
                  : data.overall.bias === "under"
                    ? "Under-rating"
                    : "Balanced"
              }
              sub={`${data.overall.avgResidual >= 0 ? "+" : ""}${data.overall.avgResidual} pts avg (actual − predicted)`}
            />
            <Tile
              label="C or VC in team's top-2"
              value={data.cvcEitherHitRate != null ? `${Math.round(data.cvcEitherHitRate * 100)}%` : "—"}
              sub={
                data.captainHitRate != null
                  ? `C ${Math.round(data.captainHitRate * 100)}% · VC ${Math.round((data.viceCaptainHitRate ?? 0) * 100)}%`
                  : undefined
              }
            />
          </div>

          {data.hasSeededActuals && (
            <p className="rounded-lg border border-line bg-[var(--surface-2)] px-3 py-2 text-xs text-muted">
              ⚠ Some actual points shown are <span className="text-[var(--warn)]">seeded demo data</span>{" "}
              (generated to demonstrate the learning loop), not real Dream11 scores. Enter real points on
              the match pages to replace them.
            </p>
          )}

          {/* error over time */}
          {data.errorOverTime.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <TrendingUp size={15} className="text-accent" /> Predicted vs actual (team totals)
              </h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.errorOverTime} margin={{ left: -18, right: 12, top: 4, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={54}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
                    <Tooltip
                      contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="predictedTotal" name="Predicted" stroke={C_PRED} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="actualTotal" name="Actual" stroke={C_ACT} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* segment accuracy + weight versions */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SegmentChart title="Mean abs error by role" rows={data.byRole} />
            <SegmentChart title="Mean abs error by pitch type" rows={data.byVenueType} />
            <SegmentChart title="Mean abs error by format" rows={data.byFormat} />
            <SegmentChart title="Mean abs error by batting band" rows={data.byBattingBand} />
          </div>

          {data.accuracyByWeightVersion.length > 1 && (
            <div className="card p-4">
              <h3 className="mb-3 font-display text-sm font-semibold">Accuracy by weight version (before / after)</h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.accuracyByWeightVersion.map((v) => ({ name: `v${v.version}`, mae: v.mae }))} margin={{ left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
                    <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="mae" name="MAE" fill={C_ACT} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* biggest misses */}
          {data.biggestMisses.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-2 font-display text-sm font-semibold">Biggest misses</h3>
              <div className="flex flex-col gap-1.5">
                {data.biggestMisses.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{m.playerName}</span>{" "}
                      <span className="text-muted">· {m.matchName}</span>
                    </span>
                    <span className="tabular-nums text-muted">
                      pred {m.predicted} → act {m.actual}{" "}
                      <span style={{ color: m.residual >= 0 ? "var(--good)" : "var(--danger)" }}>
                        ({m.residual >= 0 ? "+" : ""}
                        {m.residual})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* detected patterns + suggestions */}
      {data.openInsights.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-base font-semibold">Detected patterns &amp; weight suggestions</h3>
          {data.openInsights.map((ins) => (
            <div key={ins.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip !text-[var(--accent)] !border-[var(--accent)]">{ins.segmentType}: {ins.segmentValue}</span>
                <span className="chip">{ins.sampleSize} samples</span>
                <span
                  className="chip"
                  style={{ color: ins.biasDirection === "over" ? "var(--danger)" : "var(--warn)" }}
                >
                  {ins.biasDirection}-rating
                </span>
              </div>
              <p className="mt-2 text-sm">{ins.geminiExplanation || ins.detail}</p>
              {ins.suggestedWeightChanges && Object.keys(ins.suggestedWeightChanges).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(ins.suggestedWeightChanges).map(([k, v]) => (
                    <span key={k} className="chip">
                      {k} {v > 0 ? "+" : ""}
                      {v}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => post("/api/insights/apply", { insightId: ins.id, action: "apply" }, ins.id)}
                  disabled={busy === ins.id}
                  className="btn btn-primary text-xs"
                >
                  <Check size={13} /> Apply → new weights
                </button>
                <button
                  onClick={() => post("/api/insights/apply", { insightId: ins.id, action: "dismiss" }, ins.id + "d")}
                  disabled={busy === ins.id + "d"}
                  className="btn btn-ghost text-xs"
                >
                  <X size={13} /> Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* weight history */}
      {data.weightHistory.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold">
            <Sparkles size={15} className="text-accent" /> Weight history
          </h3>
          <div className="flex flex-col gap-1.5">
            {data.weightHistory.map((w) => (
              <div key={w.version} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold">v{w.version}</span>{" "}
                  <span className="chip !py-0 !text-[10px]">{w.label}</span>{" "}
                  {w.isActive && <span className="chip !py-0 !text-[10px] !text-[var(--accent)] !border-[var(--accent)]">active</span>}
                  {w.rationale && <p className="truncate text-[11px] text-muted">{w.rationale}</p>}
                </div>
                {!w.isActive && (
                  <button
                    onClick={() => post("/api/weights/rollback", { version: w.version }, `rb${w.version}`)}
                    disabled={busy === `rb${w.version}`}
                    className="btn btn-ghost !px-2 !py-1 text-[11px]"
                  >
                    <RotateCcw size={12} /> Use
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card flex flex-col gap-0.5 p-3">
      <span className={`font-display text-xl font-bold ${accent ? "text-accent" : ""}`}>{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
      {sub && <span className="text-[10px] text-muted">{sub}</span>}
    </div>
  );
}

function SegmentChart({ title, rows }: { title: string; rows: SegmentAccuracy[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="card p-4">
      <h3 className="mb-3 font-display text-sm font-semibold">{title}</h3>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows.map((r) => ({ name: r.value, mae: r.mae, n: r.sampleSize }))} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <Tooltip
              contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }}
              formatter={(value, _name, item) => [`MAE ${value} (n=${(item?.payload as { n: number })?.n ?? 0})`, ""]}
            />
            <Bar dataKey="mae" fill={C_BAR} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
