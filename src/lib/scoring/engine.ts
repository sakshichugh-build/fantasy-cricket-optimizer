import type { Dream11Role, ScoredPlayer } from "../types";
import { type ScoringWeights, roleBase } from "./weights";

/**
 * Points-scale feature deltas for a player in a specific match. Each value is
 * expressed in fantasy-points units, centred on 0 (positive = better than an
 * average player of that role in this context). The data/feature layer computes
 * these from cricket stats + grounded context; the engine just applies weights.
 */
export interface PlayerFeatures {
  formDelta: number; // recent form vs role baseline
  venueDelta: number; // record at this venue
  oppositionDelta: number; // record vs this opponent
  pitchDelta: number; // role-vs-pitch fit (spinner on turner, etc.)
  battingPosDelta: number; // value of batting position
  bowlingDelta: number; // expected bowling workload value
}

export interface PlayerScoringInput {
  playerId: string;
  name: string;
  team: string;
  teamShort?: string | null;
  role: Dream11Role;
  credits: number;
  creditsEstimated: boolean;
  battingOrder?: number | null;
  inAnnouncedXI: boolean;
  isImpactSub?: boolean;
  features: PlayerFeatures;
}

export interface ScoreBreakdown {
  base: number;
  recent_form: number;
  venue_record: number;
  opposition_record: number;
  role_pitch_fit: number;
  batting_position: number;
  bowling_workload: number;
  role_bonus: number;
  availability: number;
}

export interface ScoredResult {
  player: ScoredPlayer;
  breakdown: ScoreBreakdown;
}

/**
 * Deterministic expected-points for one player under the given weights.
 * baseScore = role baseline + sum(weighted feature contributions)
 *           + role bonus (AR/WK) + availability (announced XI bonus / penalty).
 * Clamped to a sane non-negative range.
 */
export function scorePlayer(input: PlayerScoringInput, w: ScoringWeights): ScoredResult {
  const f = input.features;

  const base = roleBase(w, input.role);
  const recent_form = w.recent_form * f.formDelta;
  const venue_record = w.venue_record * f.venueDelta;
  const opposition_record = w.opposition_record * f.oppositionDelta;
  const role_pitch_fit = w.role_pitch_fit * f.pitchDelta;
  const batting_position = w.batting_position * f.battingPosDelta;
  const bowling_workload = w.bowling_workload * f.bowlingDelta;

  let role_bonus = 0;
  if (input.role === "AR") role_bonus += w.allrounder_bonus;
  if (input.role === "WK") role_bonus += w.wk_bonus;

  const availability = input.inAnnouncedXI ? w.announced_xi_bonus : -w.uncertainty_penalty;

  const raw =
    base +
    recent_form +
    venue_record +
    opposition_record +
    role_pitch_fit +
    batting_position +
    bowling_workload +
    role_bonus +
    availability;

  const baseScore = Math.max(0, Math.round(raw * 100) / 100);

  const breakdown: ScoreBreakdown = {
    base,
    recent_form: round2(recent_form),
    venue_record: round2(venue_record),
    opposition_record: round2(opposition_record),
    role_pitch_fit: round2(role_pitch_fit),
    batting_position: round2(batting_position),
    bowling_workload: round2(bowling_workload),
    role_bonus: round2(role_bonus),
    availability: round2(availability),
  };

  const player: ScoredPlayer = {
    playerId: input.playerId,
    name: input.name,
    team: input.team,
    teamShort: input.teamShort ?? null,
    role: input.role,
    credits: input.credits,
    creditsEstimated: input.creditsEstimated,
    battingOrder: input.battingOrder ?? null,
    inAnnouncedXI: input.inAnnouncedXI,
    isImpactSub: input.isImpactSub ?? false,
    baseScore,
    geminiAdjustment: 0,
    expectedPoints: baseScore,
    features: breakdown as unknown as Record<string, number>,
    reason: null,
    riskFlag: null,
  };

  return { player, breakdown };
}

export function scoreAll(inputs: PlayerScoringInput[], w: ScoringWeights): ScoredPlayer[] {
  return inputs.map((i) => scorePlayer(i, w).player);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
