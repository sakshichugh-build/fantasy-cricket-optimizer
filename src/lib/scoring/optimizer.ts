import solver from "javascript-lp-solver";
import {
  CAPTAIN_MULTIPLIER,
  VICE_CAPTAIN_MULTIPLIER,
  DREAM11_ROLES,
  type Dream11Role,
  type RuleMode,
  type ScoredPlayer,
  type SelectedTeam,
} from "../types";
import { effectiveCreditCap, getRuleSet } from "../dream11Rules";
import { validateDream11Team } from "./validator";

export interface OptimizeOptions {
  mode: RuleMode;
}

export interface OptimizeResult {
  team: SelectedTeam | null;
  infeasibleReason?: string;
}

function sanitizeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Exact optimizer: pick the best 11 by expected points subject to all Dream11
 * constraints for the active mode, using integer linear programming (binary
 * selection per player). Captain/Vice-Captain are then assigned to the two
 * highest expected-point players in the chosen 11 (C = 2x, VC = 1.5x), which is
 * optimal for effective points given the selected 11.
 */
export function optimizeTeam(
  players: ScoredPlayer[],
  opts: OptimizeOptions,
): OptimizeResult {
  const rules = getRuleSet(opts.mode);
  if (players.length < rules.teamSize) {
    return { team: null, infeasibleReason: `Only ${players.length} players available; need ${rules.teamSize}` };
  }

  const anyEstimated = players.some((p) => p.creditsEstimated);
  const creditCap = effectiveCreditCap(opts.mode, anyEstimated);

  const teams = Array.from(new Set(players.map((p) => p.team)));
  const teamKey = new Map(teams.map((t) => [t, `team_${sanitizeKey(t)}`]));

  const constraints: Record<string, { min?: number; max?: number; equal?: number }> = {
    players: { equal: rules.teamSize },
    credits: { max: creditCap },
  };
  for (const t of teams) constraints[teamKey.get(t)!] = { max: rules.maxFromOneTeam };
  for (const role of DREAM11_ROLES) {
    const r = rules.roles[role];
    constraints[`role_${role}`] = { min: r.min, max: r.max };
  }

  const variables: Record<string, Record<string, number>> = {};
  const binaries: Record<string, 1> = {};
  const varToPlayer = new Map<string, ScoredPlayer>();

  players.forEach((p, i) => {
    const key = `p${i}`;
    varToPlayer.set(key, p);
    binaries[key] = 1;
    variables[key] = {
      score: p.expectedPoints,
      players: 1,
      credits: p.credits,
      [teamKey.get(p.team)!]: 1,
      [`role_${p.role}`]: 1,
    };
  });

  const model = { optimize: "score", opType: "max" as const, constraints, variables, binaries };
  const solution = solver.Solve(model) as Record<string, number> & {
    feasible: boolean;
    result: number;
  };

  if (!solution.feasible) {
    return {
      team: null,
      infeasibleReason: buildInfeasibleReason(players, opts.mode),
    };
  }

  const selected: ScoredPlayer[] = [];
  for (const [key, p] of varToPlayer) {
    if (solution[key] === 1) selected.push(p);
  }

  if (selected.length !== rules.teamSize) {
    return { team: null, infeasibleReason: `Optimizer returned ${selected.length} players` };
  }

  // Captain = highest expected; VC = second. Deterministic tie-breaks.
  const ranked = [...selected].sort(
    (a, b) =>
      b.expectedPoints - a.expectedPoints ||
      b.credits - a.credits ||
      a.name.localeCompare(b.name),
  );
  const captainId = ranked[0].playerId;
  const viceCaptainId = ranked[1].playerId;

  const roleCounts: Record<Dream11Role, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of selected) roleCounts[p.role] += 1;

  const totalCredits = round1(selected.reduce((s, p) => s + p.credits, 0));
  const totalExpectedPoints = round2(selected.reduce((s, p) => s + p.expectedPoints, 0));
  const totalEffectivePoints = round2(
    totalExpectedPoints +
      (CAPTAIN_MULTIPLIER - 1) * ranked[0].expectedPoints +
      (VICE_CAPTAIN_MULTIPLIER - 1) * ranked[1].expectedPoints,
  );

  // Team split ordered by squad size then name, formatted "6-5".
  const splitCounts = teams
    .map((t) => selected.filter((p) => p.team === t).length)
    .sort((a, b) => b - a);
  const teamSplit = splitCounts.join("-");

  const team: SelectedTeam = {
    players: selected,
    captainId,
    viceCaptainId,
    totalCredits,
    totalExpectedPoints,
    totalEffectivePoints,
    teamSplit,
    roleCounts,
    mode: opts.mode,
  };

  // Safety: never return a team that fails validation.
  const check = validateDream11Team(selected, {
    mode: opts.mode,
    captainId,
    viceCaptainId,
  });
  if (!check.valid) {
    return { team: null, infeasibleReason: `Optimizer produced invalid team: ${check.errors.join("; ")}` };
  }

  return { team };
}

/** Diagnose why no valid 11 exists, to show Aryan a useful message. */
function buildInfeasibleReason(players: ScoredPlayer[], mode: RuleMode): string {
  const rules = getRuleSet(mode);
  const counts: Record<Dream11Role, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) counts[p.role] += 1;
  const problems: string[] = [];
  for (const role of DREAM11_ROLES) {
    if (counts[role] < rules.roles[role].min) {
      problems.push(`need ≥${rules.roles[role].min} ${role} but only ${counts[role]} available`);
    }
  }
  if (problems.length === 0) {
    problems.push("constraints cannot be satisfied with the available squad (check credits/role mix)");
  }
  return `No valid ${rules.teamSize} under ${rules.label}: ${problems.join("; ")}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
