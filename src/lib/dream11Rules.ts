import type { Dream11Role, RuleMode } from "./types";

/**
 * Dream11 team rules — the single source of truth for both the optimizer and
 * the validator.
 *
 * Published sources disagree on the exact current role limits, so the app
 * defaults to **Safe mode**: a team valid under Safe mode is valid under both
 * the strict and the relaxed interpretations, which guarantees it is
 * "submittable in Dream11 with zero corrections". Relaxed mode is a toggle for
 * when Aryan's Dream11 app allows wider role bands.
 */

export interface RoleRange {
  min: number;
  max: number;
}

export interface Dream11RuleSet {
  mode: RuleMode;
  label: string;
  teamSize: number; // exactly 11
  maxCredits: number; // 100.0
  maxFromOneTeam: number;
  roles: Record<Dream11Role, RoleRange>;
}

export const DREAM11_RULES: Record<RuleMode, Dream11RuleSet> = {
  safe: {
    mode: "safe",
    label: "Safe mode",
    teamSize: 11,
    maxCredits: 100.0,
    maxFromOneTeam: 7,
    roles: {
      WK: { min: 1, max: 4 },
      BAT: { min: 3, max: 6 },
      AR: { min: 1, max: 4 },
      BOWL: { min: 3, max: 6 },
    },
  },
  relaxed: {
    mode: "relaxed",
    label: "Relaxed mode",
    teamSize: 11,
    maxCredits: 100.0,
    maxFromOneTeam: 10,
    roles: {
      WK: { min: 1, max: 8 },
      BAT: { min: 1, max: 8 },
      AR: { min: 1, max: 8 },
      BOWL: { min: 1, max: 8 },
    },
  },
};

export const DEFAULT_RULE_MODE: RuleMode = "safe";

/**
 * Safety buffer applied to the credit cap when credits are estimated (not from
 * an authoritative source). In Safe mode we optimize to <= 99.5 so a small
 * credit-estimate error cannot push the real total over 100.
 */
export const ESTIMATED_CREDIT_BUFFER = 0.5;

export function getRuleSet(mode: RuleMode): Dream11RuleSet {
  return DREAM11_RULES[mode];
}

/**
 * Effective credit cap for optimization, accounting for the estimated-credit
 * safety buffer in Safe mode.
 */
export function effectiveCreditCap(mode: RuleMode, anyEstimated: boolean): number {
  const base = DREAM11_RULES[mode].maxCredits;
  if (mode === "safe" && anyEstimated) return base - ESTIMATED_CREDIT_BUFFER;
  return base;
}
