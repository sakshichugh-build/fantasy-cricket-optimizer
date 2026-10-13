"use client";

import { useMemo, useState } from "react";
import { Check, Crown, Save, Shield, X, ArrowLeftRight, AlertTriangle } from "lucide-react";
import type { SavedPrediction, SavedPredictionPlayer } from "@/lib/data/predictions";
import type { Dream11Role, RuleMode, ScoredPlayer } from "@/lib/types";
import { validateDream11Team } from "@/lib/scoring/validator";
import { getRuleSet } from "@/lib/dream11Rules";
import { ROLE_LABEL, ROLE_COLOR, riskColor } from "@/lib/format";
import { CricketField } from "./CricketField";

const ROLE_ORDER: Dream11Role[] = ["WK", "BAT", "AR", "BOWL"];

function toScored(p: SavedPredictionPlayer): ScoredPlayer {
  return {
    playerId: p.playerId,
    name: p.name,
    team: p.team ?? "",
    teamShort: null,
    role: p.role,
    credits: p.credits,
    creditsEstimated: true,
    battingOrder: p.battingOrder,
    inAnnouncedXI: p.inAnnouncedXI,
    isImpactSub: false,
    baseScore: p.baseScore,
    geminiAdjustment: p.geminiAdjustment,
    expectedPoints: p.predictedPoints,
    features: {},
    reason: p.reason,
    riskFlag: p.riskFlag,
  };
}

export function TeamView({
  prediction,
  mode,
  onSaved,
}: {
  prediction: SavedPrediction;
  mode: RuleMode;
  onSaved?: (p: SavedPrediction) => void;
}) {
  const all = prediction.players;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(all.filter((p) => p.selected).map((p) => p.playerId)),
  );
  const [captainId, setCaptainId] = useState<string | null>(prediction.captainPlayerId);
  const [viceCaptainId, setViceCaptainId] = useState<string | null>(prediction.viceCaptainPlayerId);
  const [pendingIn, setPendingIn] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const byId = useMemo(() => new Map(all.map((p) => [p.playerId, p])), [all]);
  const selected = useMemo(
    () => all.filter((p) => selectedIds.has(p.playerId)),
    [all, selectedIds],
  );
  const bench = useMemo(
    () =>
      all
        .filter((p) => !selectedIds.has(p.playerId))
        .sort((a, b) => b.predictedPoints - a.predictedPoints),
    [all, selectedIds],
  );

  const validation = useMemo(
    () =>
      validateDream11Team(selected.map(toScored), {
        mode,
        captainId,
        viceCaptainId,
      }),
    [selected, mode, captainId, viceCaptainId],
  );

  const rules = getRuleSet(mode);
  const totalCredits = Math.round(selected.reduce((s, p) => s + p.credits, 0) * 10) / 10;
  const creditPct = Math.min(100, (totalCredits / rules.maxCredits) * 100);
  const totalExpected = Math.round(selected.reduce((s, p) => s + p.predictedPoints, 0) * 10) / 10;
  const teamCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of selected) m.set(p.team ?? "?", (m.get(p.team ?? "?") ?? 0) + 1);
    return [...m.entries()];
  }, [selected]);

  function markDirty() {
    setDirty(true);
    setSaveMsg(null);
  }

  function setCaptain(id: string) {
    if (viceCaptainId === id) setViceCaptainId(captainId);
    setCaptainId(id);
    markDirty();
  }
  function setVice(id: string) {
    if (captainId === id) setCaptainId(viceCaptainId);
    setViceCaptainId(id);
    markDirty();
  }

  function swapOut(outId: string) {
    if (!pendingIn) return;
    const next = new Set(selectedIds);
    next.delete(outId);
    next.add(pendingIn);
    setSelectedIds(next);
    if (captainId === outId) setCaptainId(pendingIn);
    if (viceCaptainId === outId) setViceCaptainId(pendingIn);
    setPendingIn(null);
    markDirty();
  }

  async function save() {
    if (!validation.valid || selected.length !== 11 || !captainId || !viceCaptainId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/predictions/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          predictionId: prediction.id,
          selectedIds: [...selectedIds],
          captainId,
          viceCaptainId,
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg(data.error || "Save failed");
      } else {
        setSaveMsg("Team saved ✓");
        setDirty(false);
        if (data.prediction && onSaved) onSaved(data.prediction);
      }
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* summary bar */}
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <Metric label="Proj. points" value={totalExpected.toFixed(0)} accent />
        <Metric label="Credits" value={`${totalCredits.toFixed(1)}/${rules.maxCredits}`} />
        <Metric label="Team split" value={teamCounts.map(([, c]) => c).join("-") || "—"} />
        <Metric label="Rules" value={rules.label} />
        <div className="ml-auto flex min-w-[160px] flex-1 flex-col gap-1">
          <div className="flex justify-between text-xs text-muted">
            <span>Credits used</span>
            <span>{totalCredits.toFixed(1)} / {rules.maxCredits}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${creditPct}%`,
                background: totalCredits > rules.maxCredits ? "var(--danger)" : "var(--accent)",
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* immersive ground + interactive roster */}
        <div className="flex flex-col gap-4">
          <CricketField players={selected} captainId={captainId} viceCaptainId={viceCaptainId} />

          <div className="card p-3 sm:p-5">
            <p className="mb-3 text-xs text-muted">
              Your XI by role — tap <span className="text-accent">C</span> /{" "}
              <span style={{ color: "var(--saffron)" }}>VC</span> on a player, or “Swap in” a bench
              player then tap one here to replace.
            </p>
            <div className="flex flex-col gap-4">
              {ROLE_ORDER.map((role) => {
                const players = selected.filter((p) => p.role === role);
                return (
                  <div key={role} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span
                        className="chip !text-[var(--text)]"
                        style={{ borderColor: ROLE_COLOR[role], color: ROLE_COLOR[role] }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: ROLE_COLOR[role] }}
                        />
                        {ROLE_LABEL[role]}
                      </span>
                      <span className="text-xs text-muted">
                        {players.length} · {rules.roles[role].min}–{rules.roles[role].max}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {players.map((p) => (
                        <PlayerChip
                          key={p.playerId}
                          p={p}
                          isCaptain={captainId === p.playerId}
                          isVice={viceCaptainId === p.playerId}
                          onCaptain={() => setCaptain(p.playerId)}
                          onVice={() => setVice(p.playerId)}
                          swapTarget={!!pendingIn}
                          onSwapOut={() => swapOut(p.playerId)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* validity + bench */}
        <div className="flex flex-col gap-4">
          <div className="card p-4">
            <h3 className="mb-2 font-display text-sm font-semibold">Validity checklist</h3>
            <ul className="flex flex-col gap-1.5">
              {validation.checks.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  {c.ok ? (
                    <Check size={14} className="text-[var(--good)]" />
                  ) : (
                    <X size={14} className="text-[var(--danger)]" />
                  )}
                  <span className={c.ok ? "text-muted" : "text-[var(--danger)]"}>
                    {c.detail || c.label}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={save}
                disabled={!validation.valid || saving || !dirty}
                className="btn btn-primary flex-1 text-sm"
              >
                <Save size={15} /> {saving ? "Saving…" : dirty ? "Save team" : "Saved"}
              </button>
            </div>
            {saveMsg && <p className="mt-2 text-xs text-muted">{saveMsg}</p>}
            {!validation.valid && (
              <p className="mt-2 flex items-center gap-1 text-xs text-[var(--danger)]">
                <AlertTriangle size={12} /> Fix the red checks before saving.
              </p>
            )}
          </div>

          <div className="card p-4">
            <h3 className="mb-1 font-display text-sm font-semibold">Bench</h3>
            <p className="mb-2 text-xs text-muted">
              {pendingIn
                ? "Now tap a player in the XI to swap them out."
                : "Tap “Swap in”, then tap a player in the XI to replace."}
            </p>
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-auto">
              {bench.slice(0, 10).map((p) => (
                <li
                  key={p.playerId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5"
                  style={{ borderLeft: `3px solid ${ROLE_COLOR[p.role]}` }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{p.name}</p>
                    <p className="text-[10px] text-muted">
                      {p.role} · {p.team} · {p.predictedPoints.toFixed(0)} pts · {p.credits.toFixed(1)}cr
                    </p>
                  </div>
                  <button
                    onClick={() => setPendingIn(pendingIn === p.playerId ? null : p.playerId)}
                    className="btn !px-2 !py-1 text-[11px]"
                    style={
                      pendingIn === p.playerId
                        ? { background: "var(--accent)", color: "var(--accent-ink)" }
                        : { background: "var(--surface-3)", color: "var(--text)" }
                    }
                  >
                    <ArrowLeftRight size={12} /> {pendingIn === p.playerId ? "Cancel" : "Swap in"}
                  </button>
                </li>
              ))}
              {bench.length === 0 && <li className="text-xs text-muted">No bench players.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span
        className={`font-display text-lg font-bold ${accent ? "text-accent" : ""}`}
      >
        {value}
      </span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

function PlayerChip({
  p,
  isCaptain,
  isVice,
  onCaptain,
  onVice,
  swapTarget,
  onSwapOut,
}: {
  p: SavedPredictionPlayer;
  isCaptain: boolean;
  isVice: boolean;
  onCaptain: () => void;
  onVice: () => void;
  swapTarget: boolean;
  onSwapOut: () => void;
}) {
  return (
    <div
      className="group relative flex flex-col gap-1 rounded-xl border border-line bg-[var(--surface-2)] p-2.5 pl-3"
      style={isCaptain ? { borderColor: "var(--accent)" } : isVice ? { borderColor: "var(--saffron)" } : undefined}
    >
      <span
        className="absolute bottom-2 left-1 top-2 w-1 rounded-full"
        style={{ background: ROLE_COLOR[p.role] }}
      />
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">{p.name}</p>
          <p className="text-[10px] text-muted">
            {p.team} · {p.credits.toFixed(1)}cr<span className="opacity-60"> est</span>
            {!p.inAnnouncedXI && <span className="text-[var(--warn)]"> · guessed</span>}
          </p>
        </div>
        <span className="font-display text-sm font-bold text-accent">{p.predictedPoints.toFixed(0)}</span>
      </div>

      {p.reason && <p className="line-clamp-2 text-[10px] leading-snug text-muted">{p.reason}</p>}

      <div className="flex items-center gap-1">
        <button
          onClick={onCaptain}
          className="chip !px-1.5 !py-0.5 !text-[10px]"
          style={isCaptain ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}
          title="Set Captain"
        >
          <Crown size={11} /> C
        </button>
        <button
          onClick={onVice}
          className="chip !px-1.5 !py-0.5 !text-[10px]"
          style={isVice ? { color: "var(--saffron)", borderColor: "var(--saffron)" } : undefined}
          title="Set Vice-Captain"
        >
          <Shield size={11} /> VC
        </button>
        {p.riskFlag && (
          <span className="chip !px-1.5 !py-0.5 !text-[10px]" style={{ color: riskColor(p.riskFlag) }}>
            {p.riskFlag}
          </span>
        )}
        {swapTarget && (
          <button
            onClick={onSwapOut}
            className="chip ml-auto !px-1.5 !py-0.5 !text-[10px] !text-[var(--danger)] !border-[var(--danger)]"
          >
            Swap out
          </button>
        )}
      </div>
    </div>
  );
}
