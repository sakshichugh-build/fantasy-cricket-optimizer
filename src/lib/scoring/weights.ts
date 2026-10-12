import { z } from "zod";
import type { Dream11Role } from "../types";

/**
 * The weighted scoring model. Each `*` multiplier is a trust factor applied to a
 * points-scale feature delta (a quantity already expressed in fantasy-points
 * units, centred on 0). `base_by_role` is the structural baseline per role.
 *
 * The self-improvement loop adjusts the multipliers (TUNABLE_WEIGHT_KEYS) from
 * prediction residuals; base_by_role is left structural.
 */
export const weightsSchema = z.object({
  recent_form: z.number(),
  venue_record: z.number(),
  opposition_record: z.number(),
  role_pitch_fit: z.number(),
  batting_position: z.number(),
  bowling_workload: z.number(),
  allrounder_bonus: z.number(),
  wk_bonus: z.number(),
  announced_xi_bonus: z.number(),
  uncertainty_penalty: z.number(),
  base_by_role: z.object({
    BAT: z.number(),
    BOWL: z.number(),
    AR: z.number(),
    WK: z.number(),
  }),
});

export type ScoringWeights = z.infer<typeof weightsSchema>;

/** Multiplier keys the learning loop is allowed to tune. */
export const TUNABLE_WEIGHT_KEYS = [
  "recent_form",
  "venue_record",
  "opposition_record",
  "role_pitch_fit",
  "batting_position",
  "bowling_workload",
  "allrounder_bonus",
  "wk_bonus",
  "announced_xi_bonus",
  "uncertainty_penalty",
] as const;

export type TunableWeightKey = (typeof TUNABLE_WEIGHT_KEYS)[number];

/** Guardrails: a tuned multiplier is clamped to this range. */
export const WEIGHT_BOUNDS: Record<TunableWeightKey, { min: number; max: number }> = {
  recent_form: { min: 0.2, max: 2.5 },
  venue_record: { min: 0, max: 2 },
  opposition_record: { min: 0, max: 2 },
  role_pitch_fit: { min: 0, max: 2.5 },
  batting_position: { min: 0, max: 2 },
  bowling_workload: { min: 0, max: 2 },
  allrounder_bonus: { min: 0, max: 12 },
  wk_bonus: { min: 0, max: 8 },
  announced_xi_bonus: { min: 0, max: 10 },
  uncertainty_penalty: { min: 0, max: 25 },
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  recent_form: 1.0,
  venue_record: 0.6,
  opposition_record: 0.5,
  role_pitch_fit: 1.0,
  batting_position: 0.5,
  bowling_workload: 0.8,
  allrounder_bonus: 6.0,
  wk_bonus: 3.0,
  announced_xi_bonus: 4.0,
  uncertainty_penalty: 10.0,
  base_by_role: { BAT: 30, BOWL: 28, AR: 34, WK: 29 },
};

export function parseWeights(raw: unknown): ScoringWeights {
  return weightsSchema.parse(raw);
}

/** Map a role to its base_by_role key. */
export function roleBase(weights: ScoringWeights, role: Dream11Role): number {
  return weights.base_by_role[role];
}
