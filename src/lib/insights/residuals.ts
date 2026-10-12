import type { Dream11Role, MatchFormat } from "../types";
import type { TunableWeightKey } from "../scoring/weights";

/** One selected player's predicted-vs-actual outcome in a completed match. */
export interface Observation {
  predictionId: string;
  matchId: string;
  format: MatchFormat;
  pitchType: string;
  role: Dream11Role;
  battingOrder: number | null;
  inAnnouncedXI: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  predicted: number;
  actual: number;
}

export interface SegmentInsight {
  segmentType: string;
  segmentValue: string;
  sampleSize: number;
  avgResidual: number; // mean(actual - predicted); >0 => under-predicted
  meanAbsError: number;
  biasDirection: "over" | "under" | "none";
  detail: string;
  suggestedWeightChanges: Partial<Record<TunableWeightKey, number>>;
}

export interface AnalyzeOptions {
  minSample?: number;
  biasThreshold?: number;
  learningRate?: number;
}

export function battingBand(order: number | null): "top" | "middle" | "lower" | "unknown" {
  if (order == null) return "unknown";
  if (order <= 3) return "top";
  if (order <= 6) return "middle";
  return "lower";
}

const BONUS_KEYS = new Set<TunableWeightKey>([
  "allrounder_bonus",
  "wk_bonus",
  "announced_xi_bonus",
  "uncertainty_penalty",
]);

/** Map a biased segment to a weight nudge (bounded gradient step on the residual). */
export function suggestWeightChange(
  segmentType: string,
  segmentValue: string,
  avgResidual: number,
  learningRate: number,
): Partial<Record<TunableWeightKey, number>> {
  let key: TunableWeightKey | null = null;
  switch (segmentType) {
    case "role":
      key =
        segmentValue === "BAT"
          ? "batting_position"
          : segmentValue === "BOWL"
            ? "bowling_workload"
            : segmentValue === "AR"
              ? "allrounder_bonus"
              : segmentValue === "WK"
                ? "wk_bonus"
                : null;
      break;
    case "venue_type":
      key = "role_pitch_fit";
      break;
    case "batting_band":
      key = "batting_position";
      break;
    case "availability":
      key = segmentValue === "unconfirmed" ? "uncertainty_penalty" : "announced_xi_bonus";
      break;
    case "format":
    case "overall":
      key = "recent_form";
      break;
  }
  if (!key) return {};

  let delta: number;
  if (key === "uncertainty_penalty") {
    // penalty reduces score; over-prediction (avgResidual<0) => increase penalty
    delta = clamp(-learningRate * avgResidual, -5, 5);
  } else if (BONUS_KEYS.has(key)) {
    delta = clamp(learningRate * avgResidual, -4, 4);
  } else {
    // multiplier weights act on ~8-point feature deltas
    delta = clamp((learningRate * avgResidual) / 8, -0.4, 0.4);
  }
  delta = Math.round(delta * 100) / 100;
  if (Math.abs(delta) < 0.01) return {};
  return { [key]: delta };
}

function stats(obs: Observation[]): { avg: number; mae: number } {
  const n = obs.length;
  const sum = obs.reduce((s, o) => s + (o.actual - o.predicted), 0);
  const absSum = obs.reduce((s, o) => s + Math.abs(o.actual - o.predicted), 0);
  return { avg: sum / n, mae: absSum / n };
}

/**
 * Detect segments where predictions are consistently biased and propose weight
 * changes. Pure: takes observations, returns insights. Only segments with
 * sampleSize >= minSample and |avgResidual| >= biasThreshold are returned.
 */
export function analyzeResiduals(
  obs: Observation[],
  opts: AnalyzeOptions = {},
): SegmentInsight[] {
  const minSample = opts.minSample ?? 5;
  const biasThreshold = opts.biasThreshold ?? 6;
  const lr = opts.learningRate ?? 0.3;

  const groups = new Map<string, { type: string; value: string; obs: Observation[] }>();
  const push = (type: string, value: string, o: Observation) => {
    const k = `${type}:${value}`;
    if (!groups.has(k)) groups.set(k, { type, value, obs: [] });
    groups.get(k)!.obs.push(o);
  };

  for (const o of obs) {
    push("overall", "all", o);
    push("format", o.format, o);
    push("venue_type", o.pitchType || "unknown", o);
    push("role", o.role, o);
    push("batting_band", battingBand(o.battingOrder), o);
    push("availability", o.inAnnouncedXI ? "announced" : "unconfirmed", o);
  }

  const insights: SegmentInsight[] = [];
  for (const { type, value, obs: g } of groups.values()) {
    if (g.length < minSample) continue;
    const { avg, mae } = stats(g);
    const bias: SegmentInsight["biasDirection"] =
      avg <= -biasThreshold ? "over" : avg >= biasThreshold ? "under" : "none";
    if (bias === "none") continue;

    const suggestedWeightChanges = suggestWeightChange(type, value, avg, lr);
    const direction = bias === "over" ? "over-rating" : "under-rating";
    const detail = `${direction} ${labelFor(type, value)} by ${Math.abs(avg).toFixed(1)} pts avg over ${g.length} selections (MAE ${mae.toFixed(1)}).`;

    insights.push({
      segmentType: type,
      segmentValue: value,
      sampleSize: g.length,
      avgResidual: Math.round(avg * 100) / 100,
      meanAbsError: Math.round(mae * 100) / 100,
      biasDirection: bias,
      detail,
      suggestedWeightChanges,
    });
  }

  // Strongest bias first.
  insights.sort((a, b) => Math.abs(b.avgResidual) - Math.abs(a.avgResidual));
  return insights;
}

function labelFor(type: string, value: string): string {
  switch (type) {
    case "overall":
      return "players overall";
    case "format":
      return `${value} matches`;
    case "venue_type":
      return `${value}-friendly pitches`;
    case "role":
      return `${value} players`;
    case "batting_band":
      return `${value}-order batters`;
    case "availability":
      return value === "unconfirmed" ? "unconfirmed players" : "announced-XI players";
    default:
      return value;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
