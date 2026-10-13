"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Crown,
  Shield,
  Copy,
  Check,
  MapPin,
  CloudSun,
  Wand2,
  ClipboardList,
  Info,
} from "lucide-react";
import type { MatchListItem } from "@/lib/data/matches";
import type { SavedPrediction } from "@/lib/data/predictions";
import type { RuleMode } from "@/lib/types";
import { formatIST, pitchLabel, statusMeta, formatColor } from "@/lib/format";
import { TeamView } from "@/components/team/TeamView";

interface Meta {
  contextSummary: string;
  pitchType: string;
  avgFirstInnings: number | null;
  weatherNote: string | null;
  sources: { title?: string; uri?: string }[];
  grounded: boolean;
  geminiUsed: boolean;
  captainReason: string;
  viceCaptainReason: string;
  shareableSummary: string;
}

const STEPS = [
  "Gathering squads & live context",
  "Scoring players (weighted model)",
  "Gemini match-specific reasoning",
  "Optimizing the XI (ILP)",
  "Validating Dream11 rules",
];

function metaFromPrediction(p: SavedPrediction | null): Meta | null {
  if (!p || !p.geminiReasoning) return null;
  const r = p.geminiReasoning as Record<string, unknown>;
  return {
    contextSummary: (r.contextSummary as string) || (r.contextNote as string) || "",
    pitchType: (r.pitchType as string) || "unknown",
    avgFirstInnings: null,
    weatherNote: null,
    sources: (r.contextSources as { title?: string; uri?: string }[]) || [],
    grounded: Boolean(r.grounded),
    geminiUsed: Boolean(r.geminiUsed),
    captainReason: (r.captainReason as string) || "",
    viceCaptainReason: (r.viceCaptainReason as string) || "",
    shareableSummary: (r.shareableSummary as string) || "",
  };
}

export function MatchAnalysis({
  match,
  initialPrediction,
}: {
  match: MatchListItem;
  initialPrediction: SavedPrediction | null;
}) {
  const [prediction, setPrediction] = useState<SavedPrediction | null>(initialPrediction);
  const [meta, setMeta] = useState<Meta | null>(metaFromPrediction(initialPrediction));
  const [mode, setMode] = useState<RuleMode>(
    (initialPrediction?.ruleMode as RuleMode) || "safe",
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (stepTimer.current && clearInterval(stepTimer.current)), []);

  // Warm the squad in the background when an un-analysed match loads, so the
  // first "Analyse" only does context + reasoning and fits the function timeout.
  const prepped = useRef(false);
  useEffect(() => {
    if (prepped.current || prediction) return;
    prepped.current = true;
    fetch("/api/matches/prep", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId: match.id }),
    }).catch(() => {});
  }, [prediction, match.id]);

  const s = statusMeta(match.status);
  // Lock re-analysis once actual points exist, so the saved team + learning data
  // can never be silently overwritten.
  const locked = useMemo(
    () => prediction?.players.some((p) => p.actualPoints != null) ?? false,
    [prediction],
  );

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    setStep(0);
    stepTimer.current = setInterval(() => {
      setStep((x) => Math.min(x + 1, STEPS.length - 2));
    }, 1400);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: match.id, mode }),
      });
      if (stepTimer.current) clearInterval(stepTimer.current);
      // Responses may not be JSON (e.g. a platform 504 page), so parse defensively.
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      if (!res.ok || !data) {
        setError(
          data?.error ||
            (res.status === 504 || res.status === 503 || res.status === 500
              ? "The first analysis took too long (cold start). Tap “Re-analyse” — the squad is now cached, so it finishes in a few seconds."
              : "Analysis failed. Please try again."),
        );
        setAnalyzing(false);
        return;
      }
      setStep(STEPS.length);
      setPrediction(data.prediction);
      setMeta({
        contextSummary: data.context.summary,
        pitchType: data.context.pitchType,
        avgFirstInnings: data.context.avgFirstInningsScore,
        weatherNote: data.context.weatherNote,
        sources: data.context.sources || [],
        grounded: data.context.grounded,
        geminiUsed: data.reasoning.used,
        captainReason: data.reasoning.captainReason,
        viceCaptainReason: data.reasoning.viceCaptainReason,
        shareableSummary: data.reasoning.shareableSummary,
      });
      setTimeout(() => setAnalyzing(false), 500);
    } catch (e) {
      if (stepTimer.current) clearInterval(stepTimer.current);
      setError(e instanceof Error ? e.message : "Analysis failed");
      setAnalyzing(false);
    }
  }

  const captain = prediction?.players.find((p) => p.isCaptain);
  const vice = prediction?.players.find((p) => p.isViceCaptain);

  return (
    <div className="flex flex-col gap-5">
      {/* header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="chip" style={{ color: formatColor(match.format), borderColor: formatColor(match.format) }}>
            {match.format}
          </span>
          <span className="chip" style={{ color: s.color, borderColor: s.color }}>
            {s.label}
          </span>
          {match.series && <span className="text-muted">{match.series}</span>}
        </div>
        <h1 className="mt-2 font-display text-xl font-bold sm:text-2xl">{match.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="flex items-center gap-1">
            <MapPin size={14} /> {match.venue || "Venue TBD"}
          </span>
          <span>{formatIST(match.startTime)}</span>
          {match.status === "completed" && match.resultText && (
            <span className="text-[var(--text)]">{match.resultText}</span>
          )}
        </div>
        {match.squadSource === "ai" && (
          <p className="chip mt-2 w-fit max-w-full !whitespace-normal !border-[var(--warn)] !text-left !text-[var(--warn)]">
            AI-estimated squad — cricket API squad unavailable on free tier
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-[var(--surface-2)] p-0.5">
            {(["safe", "relaxed"] as RuleMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="btn !px-3 !py-1.5 text-xs capitalize"
                style={
                  mode === m
                    ? { background: "var(--accent)", color: "var(--accent-ink)" }
                    : { background: "transparent", color: "var(--muted)" }
                }
              >
                {m} mode
              </button>
            ))}
          </div>
          <button
            onClick={analyze}
            disabled={analyzing || locked}
            title={locked ? "Locked — this match has saved actual points" : undefined}
            className="btn btn-primary text-sm"
          >
            <Sparkles size={16} />
            {analyzing
              ? "Analysing…"
              : locked
                ? "Locked (has actual points)"
                : prediction
                  ? "Re-analyse"
                  : "Analyse this match"}
          </button>
          {prediction && (
            <Link href={`/match/${match.id}/actuals`} className="btn btn-ghost text-sm">
              <ClipboardList size={16} /> {locked ? "View / edit actual points" : "Enter actual points"}
            </Link>
          )}
        </div>
        {locked && (
          <p className="mt-2 text-xs text-[var(--warn)]">
            🔒 Re-analysis is locked because this team has actual points saved. This protects the
            learning data from being overwritten.
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          Safe mode builds a team valid under both rule interpretations — submittable with zero
          corrections.
        </p>
      </div>

      {analyzing && <Stepper step={step} />}

      {error && (
        <div className="card border-[var(--danger)] p-4 text-sm">
          <p className="font-semibold text-[var(--danger)]">Couldn’t build a team</p>
          <p className="text-muted">{error}</p>
        </div>
      )}

      {meta && !analyzing && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <ContextPanel meta={meta} />
          {captain && vice && (
            <CVCPanel
              captain={{ name: captain.name, reason: meta.captainReason }}
              vice={{ name: vice.name, reason: meta.viceCaptainReason }}
              shareable={meta.shareableSummary}
              matchName={match.name}
            />
          )}
        </div>
      )}

      {prediction && !analyzing && (
        <TeamView prediction={prediction} mode={mode} onSaved={(p) => { setPrediction(p); setMeta(metaFromPrediction(p)); }} />
      )}

      {!prediction && !analyzing && !error && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Wand2 className="text-accent" />
          <p className="font-display text-lg font-semibold">No team yet</p>
          <p className="max-w-md text-sm text-muted">
            Hit “Analyse this match” to pull squads &amp; live conditions, score every player, and build a
            valid, optimized Dream11 XI with captaincy reasoning.
          </p>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="card p-5">
      <ol className="flex flex-col gap-3">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition"
                style={{
                  background: done ? "var(--accent)" : active ? "var(--surface-3)" : "var(--surface-2)",
                  color: done ? "var(--accent-ink)" : "var(--muted)",
                  border: active ? "1px solid var(--accent)" : "1px solid var(--line)",
                }}
              >
                {done ? <Check size={13} /> : i + 1}
              </span>
              <span className={`text-sm ${active ? "text-text" : done ? "text-muted" : "text-muted"}`}>
                {label}
              </span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ContextPanel({ meta }: { meta: Meta }) {
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <CloudSun size={16} className="text-accent" />
        <h3 className="font-display text-sm font-semibold">Live match context</h3>
        {meta.grounded ? (
          <span className="chip !text-[var(--accent)] !border-[var(--accent)]">Google-grounded</span>
        ) : (
          <span className="chip" title="Grounding unavailable — neutral assumptions used">
            <Info size={11} /> model estimate
          </span>
        )}
      </div>
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        <span className="chip">Pitch: {pitchLabel(meta.pitchType)}</span>
        {meta.avgFirstInnings && <span className="chip">Par ~{meta.avgFirstInnings}</span>}
        {!meta.geminiUsed && <span className="chip !text-[var(--warn)]">Deterministic fallback</span>}
      </div>
      <p className="whitespace-pre-line text-sm text-muted">{meta.contextSummary}</p>
      {meta.weatherNote && <p className="mt-2 text-xs text-muted">☁ {meta.weatherNote}</p>}
      {meta.sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {meta.sources.slice(0, 4).map((src, i) => (
            <a
              key={i}
              href={src.uri}
              target="_blank"
              rel="noreferrer"
              className="chip hover:!text-[var(--accent)]"
            >
              {(src.title || "source").slice(0, 22)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function CVCPanel({
  captain,
  vice,
  shareable,
  matchName,
}: {
  captain: { name: string; reason: string };
  vice: { name: string; reason: string };
  shareable: string;
  matchName: string;
}) {
  const [copied, setCopied] = useState(false);
  const text =
    shareable ||
    `${matchName} — my Dream11 picks:\n(C) ${captain.name}: ${captain.reason}\n(VC) ${vice.name}: ${vice.reason}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${matchName}\n\n(C) ${captain.name} — ${captain.reason}\n(VC) ${vice.name} — ${vice.reason}\n\n${shareable}`.trim(),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card flex flex-col gap-3 p-5">
      <h3 className="font-display text-sm font-semibold">Captaincy call</h3>
      <div className="rounded-xl border border-[var(--accent)] bg-[var(--surface-2)] p-3">
        <div className="flex items-center gap-2">
          <Crown size={15} className="text-accent" />
          <span className="text-sm font-bold">{captain.name}</span>
          <span className="chip !text-[var(--accent)] !border-[var(--accent)]">Captain · 2×</span>
        </div>
        <p className="mt-1 text-xs text-muted">{captain.reason}</p>
      </div>
      <div className="rounded-xl border border-[var(--saffron)] bg-[var(--surface-2)] p-3">
        <div className="flex items-center gap-2">
          <Shield size={15} style={{ color: "var(--saffron)" }} />
          <span className="text-sm font-bold">{vice.name}</span>
          <span className="chip !text-[var(--saffron)] !border-[var(--saffron)]">Vice · 1.5×</span>
        </div>
        <p className="mt-1 text-xs text-muted">{vice.reason}</p>
      </div>
      {shareable && <p className="text-xs text-muted">{shareable}</p>}
      <button onClick={copy} className="btn btn-ghost text-sm">
        {copied ? <Check size={15} className="text-[var(--good)]" /> : <Copy size={15} />}
        {copied ? "Copied!" : "Copy for league group"}
      </button>
    </div>
  );
}
