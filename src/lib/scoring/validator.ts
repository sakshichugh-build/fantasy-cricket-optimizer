import {
  DREAM11_ROLES,
  type Dream11Role,
  type RuleMode,
  type ScoredPlayer,
  type ValidationCheck,
  type ValidationResult,
} from "../types";
import { getRuleSet } from "../dream11Rules";

export interface ValidateOptions {
  mode: RuleMode;
  captainId: string | null;
  viceCaptainId: string | null;
}

function roleCounts(players: { role: Dream11Role }[]): Record<Dream11Role, number> {
  const counts: Record<Dream11Role, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) counts[p.role] += 1;
  return counts;
}

function teamCounts(players: { team: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of players) m.set(p.team, (m.get(p.team) ?? 0) + 1);
  return m;
}

/**
 * Hard-checks a proposed Dream11 team against every rule for the given mode.
 * Pure and deterministic. The app must never display a team where valid=false.
 */
export function validateDream11Team(
  players: ScoredPlayer[],
  opts: ValidateOptions,
): ValidationResult {
  const rules = getRuleSet(opts.mode);
  const checks: ValidationCheck[] = [];
  const errors: string[] = [];

  const add = (label: string, ok: boolean, detail?: string) => {
    checks.push({ label, ok, detail });
    if (!ok && detail) errors.push(detail);
    else if (!ok) errors.push(label);
  };

  // 1. Exactly 11 players
  add(
    `Exactly ${rules.teamSize} players`,
    players.length === rules.teamSize,
    players.length === rules.teamSize
      ? undefined
      : `Team has ${players.length} players, must be exactly ${rules.teamSize}`,
  );

  // 2. No duplicate players
  const ids = new Set(players.map((p) => p.playerId));
  add(
    "No duplicate players",
    ids.size === players.length,
    ids.size === players.length ? undefined : "Team contains duplicate players",
  );

  // 3. Credits within cap
  const totalCredits = Math.round(players.reduce((s, p) => s + p.credits, 0) * 10) / 10;
  add(
    `Credits ≤ ${rules.maxCredits.toFixed(1)}`,
    totalCredits <= rules.maxCredits + 1e-9,
    totalCredits <= rules.maxCredits + 1e-9
      ? undefined
      : `Credits used ${totalCredits.toFixed(1)} exceeds cap ${rules.maxCredits.toFixed(1)}`,
  );

  // 4. Max players from one real team
  const tc = teamCounts(players);
  let worstTeam = "";
  let worstCount = 0;
  for (const [team, count] of tc) {
    if (count > worstCount) {
      worstCount = count;
      worstTeam = team;
    }
  }
  add(
    `≤ ${rules.maxFromOneTeam} from one team`,
    worstCount <= rules.maxFromOneTeam,
    worstCount <= rules.maxFromOneTeam
      ? undefined
      : `${worstCount} players from ${worstTeam}; max ${rules.maxFromOneTeam}`,
  );

  // 5. Role bands
  const rc = roleCounts(players);
  for (const role of DREAM11_ROLES) {
    const range = rules.roles[role];
    const n = rc[role];
    const ok = n >= range.min && n <= range.max;
    add(
      `${role}: ${range.min}–${range.max}`,
      ok,
      ok ? undefined : `${role} count ${n} outside ${range.min}–${range.max}`,
    );
  }

  // 6. Captain / Vice-Captain
  const cap = opts.captainId;
  const vc = opts.viceCaptainId;
  const capOk = !!cap && ids.has(cap);
  const vcOk = !!vc && ids.has(vc);
  const different = !!cap && !!vc && cap !== vc;
  add("Captain set and in team", capOk, capOk ? undefined : "Captain not set or not in the 11");
  add(
    "Vice-Captain set and in team",
    vcOk,
    vcOk ? undefined : "Vice-Captain not set or not in the 11",
  );
  add(
    "Captain ≠ Vice-Captain",
    different,
    different ? undefined : "Captain and Vice-Captain must be different players",
  );

  return { valid: errors.length === 0, errors, checks };
}
