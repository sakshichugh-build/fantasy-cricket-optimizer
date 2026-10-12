// Shared domain types used across scoring, optimizer, validator and UI.

export type Dream11Role = "WK" | "BAT" | "AR" | "BOWL";
export const DREAM11_ROLES: Dream11Role[] = ["WK", "BAT", "AR", "BOWL"];

export type RuleMode = "safe" | "relaxed";

export type MatchFormat = "T20" | "ODI" | "TEST" | "T10";
export type MatchStatus = "upcoming" | "live" | "completed";

/** A player as scored by the deterministic engine, ready for the optimizer. */
export interface ScoredPlayer {
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
  /** Deterministic expected points from the weighted model. */
  baseScore: number;
  /** Bounded adjustment from the Gemini reasoning layer (default 0). */
  geminiAdjustment: number;
  /** baseScore + geminiAdjustment. */
  expectedPoints: number;
  /** Per-feature contribution breakdown, for transparency in the UI. */
  features: Record<string, number>;
  reason?: string | null;
  riskFlag?: string | null;
}

/** C = 2x, VC = 1.5x multipliers. */
export const CAPTAIN_MULTIPLIER = 2;
export const VICE_CAPTAIN_MULTIPLIER = 1.5;

export interface SelectedTeam {
  players: ScoredPlayer[]; // exactly 11 when valid
  captainId: string | null;
  viceCaptainId: string | null;
  totalCredits: number;
  totalExpectedPoints: number; // sum of expectedPoints
  totalEffectivePoints: number; // with C/VC multipliers applied
  teamSplit: string; // e.g. "6-5"
  roleCounts: Record<Dream11Role, number>;
  mode: RuleMode;
}

export interface ValidationCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  checks: ValidationCheck[];
}
