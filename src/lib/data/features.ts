import type { MatchFormat } from "../types";
import type { PlayerFeatures } from "../scoring/engine";
import type { SquadMember } from "../cricket/ingest";

export type PitchType = "spin" | "pace" | "balanced" | "batting" | "bowling" | "unknown";

export interface MatchContext {
  format: MatchFormat;
  pitchType: PitchType;
  /** -1 (bowler-friendly) .. +1 (flat batting track). */
  battingFriendliness: number;
  avgFirstInningsScore?: number | null;
  weatherNote?: string | null;
  summary: string;
  sources: { title?: string; uri?: string }[];
  grounded: boolean;
}

export const NEUTRAL_CONTEXT: MatchContext = {
  format: "T20",
  pitchType: "unknown",
  battingFriendliness: 0,
  avgFirstInningsScore: null,
  weatherNote: null,
  summary: "No live context available; using neutral assumptions.",
  sources: [],
  grounded: false,
};

function isSpinBowler(style: string | null): boolean {
  const s = (style || "").toLowerCase();
  return /spin|orthodox|legbreak|leg break|googly|offbreak|off break|chinaman/.test(s);
}
function isPaceBowler(style: string | null): boolean {
  const s = (style || "").toLowerCase();
  return /fast|medium|pace|seam/.test(s);
}

/**
 * Turn a squad member + grounded match context into points-scale feature deltas.
 * Where the free data source lacks per-player venue/opposition history, those
 * deltas stay 0 and the Gemini reasoning layer supplies the bounded nuance.
 */
export function buildFeatures(
  m: SquadMember,
  ctx: MatchContext,
  squadAvgCredits: number,
): PlayerFeatures {
  const topOrder = m.battingOrder != null && m.battingOrder <= 3;
  const middleOrder = m.battingOrder != null && m.battingOrder >= 4 && m.battingOrder <= 6;
  const t20ish = ctx.format === "T20" || ctx.format === "T10";

  // Quality proxy from credits (credits encode player quality once estimated/known)
  const formDelta = clamp((m.credits - squadAvgCredits) * 6, -18, 18);

  // Batting position value (batters/keepers/all-rounders who bat up the order)
  let battingPosDelta = 0;
  if (m.role === "BAT" || m.role === "WK" || m.role === "AR") {
    if (topOrder) battingPosDelta = t20ish ? 7 : 6;
    else if (middleOrder) battingPosDelta = 3;
    else battingPosDelta = m.role === "AR" ? 0 : -2;
    // flat batting tracks reward batters more
    battingPosDelta += ctx.battingFriendliness * 3;
  }

  // Expected bowling workload value (front-line bowlers; part-time for AR)
  let bowlingDelta = 0;
  if (m.role === "BOWL") bowlingDelta = 5 - ctx.battingFriendliness * 3;
  else if (m.role === "AR") bowlingDelta = 2 - ctx.battingFriendliness * 1.5;

  // Role vs pitch fit
  let pitchDelta = 0;
  const spin = isSpinBowler(m.bowlingStyle);
  const pace = isPaceBowler(m.bowlingStyle);
  if (ctx.pitchType === "spin") {
    if ((m.role === "BOWL" || m.role === "AR") && spin) pitchDelta += 6;
    if ((m.role === "BOWL" || m.role === "AR") && pace) pitchDelta -= 3;
  } else if (ctx.pitchType === "pace" || ctx.pitchType === "bowling") {
    if ((m.role === "BOWL" || m.role === "AR") && pace) pitchDelta += 6;
    if ((m.role === "BOWL" || m.role === "AR") && spin) pitchDelta -= 2;
    if (m.role === "BAT" || m.role === "WK") pitchDelta -= 2;
  } else if (ctx.pitchType === "batting") {
    if (m.role === "BAT" || m.role === "WK") pitchDelta += 4;
    if (m.role === "BOWL") pitchDelta -= 3;
  }

  return {
    formDelta: round2(formDelta),
    venueDelta: 0,
    oppositionDelta: 0,
    pitchDelta: round2(pitchDelta),
    battingPosDelta: round2(battingPosDelta),
    bowlingDelta: round2(bowlingDelta),
  };
}

export function squadAverageCredits(members: { credits: number }[]): number {
  if (members.length === 0) return 8.5;
  return members.reduce((s, m) => s + m.credits, 0) / members.length;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
