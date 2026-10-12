"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Crown, Save, Shield, BarChart3 } from "lucide-react";
import type { SavedPrediction } from "@/lib/data/predictions";

export function ActualsForm({ prediction, matchId }: { prediction: SavedPrediction; matchId: string }) {
  const selected = useMemo(
    () => prediction.players.filter((p) => p.selected).sort((a, b) => b.predictedPoints - a.predictedPoints),
    [prediction],
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(selected.map((p) => [p.playerId, p.actualPoints != null ? String(p.actualPoints) : ""])),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const entered = selected.filter((p) => values[p.playerId] !== "" && !Number.isNaN(Number(values[p.playerId])));
  const totalActual = entered.reduce((s, p) => s + Number(values[p.playerId]), 0);
  const totalPredicted = entered.reduce((s, p) => s + p.predictedPoints, 0);

  async function submit() {
    const entries = selected
      .filter((p) => values[p.playerId] !== "" && !Number.isNaN(Number(values[p.playerId])))
      .map((p) => ({ playerId: p.playerId, playerName: p.name, points: Number(values[p.playerId]) }));
    if (entries.length === 0) {
      setMsg("Enter at least one player's points.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/actuals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ predictionId: prediction.id, entries }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || "Save failed");
      else {
        setMsg(`Saved ${entries.length} players ✓`);
        setSaved(true);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 text-right font-medium">Predicted</th>
              <th className="px-3 py-2 text-right font-medium">Actual points</th>
            </tr>
          </thead>
          <tbody>
            {selected.map((p, i) => {
              const diff =
                values[p.playerId] !== "" && !Number.isNaN(Number(values[p.playerId]))
                  ? Number(values[p.playerId]) - p.predictedPoints
                  : null;
              return (
                <tr key={p.playerId} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {p.name}
                      {p.isCaptain && <Crown size={12} className="text-accent" />}
                      {p.isViceCaptain && <Shield size={12} style={{ color: "var(--saffron)" }} />}
                    </span>
                    <span className="text-[10px] text-muted">{p.team}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{p.role}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">
                    {p.predictedPoints.toFixed(0)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {diff != null && (
                        <span
                          className="text-[10px] tabular-nums"
                          style={{ color: diff >= 0 ? "var(--good)" : "var(--danger)" }}
                        >
                          {diff >= 0 ? "+" : ""}
                          {diff.toFixed(0)}
                        </span>
                      )}
                      <input
                        inputMode="decimal"
                        tabIndex={i + 1}
                        value={values[p.playerId]}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [p.playerId]: e.target.value.replace(/[^0-9.\-]/g, "") }))
                        }
                        placeholder="—"
                        className="w-20 rounded-lg border border-line bg-[var(--surface-2)] px-2 py-1 text-right tabular-nums outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <Metric label="Players entered" value={`${entered.length}/11`} />
        <Metric label="Actual total" value={totalActual.toFixed(0)} accent />
        <Metric label="Predicted (those players)" value={totalPredicted.toFixed(0)} />
        <Metric
          label="Error"
          value={entered.length ? (totalActual - totalPredicted >= 0 ? "+" : "") + (totalActual - totalPredicted).toFixed(0) : "—"}
        />
        <div className="ml-auto flex items-center gap-2">
          <button onClick={submit} disabled={saving} className="btn btn-primary text-sm">
            <Save size={15} /> {saving ? "Saving…" : "Save actual points"}
          </button>
          {saved && (
            <Link href="/insights" className="btn btn-ghost text-sm">
              <BarChart3 size={15} /> View insights
            </Link>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
      <p className="text-xs text-muted">
        Your manual entry is the source of truth. Tab through the fields; only players you fill are stored.
        Then recompute insights on the Insights page to update the learning loop.
      </p>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={`font-display text-lg font-bold ${accent ? "text-accent" : ""}`}>{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}
