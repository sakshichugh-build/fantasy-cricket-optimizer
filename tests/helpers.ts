import type { Dream11Role, ScoredPlayer } from "@/lib/types";

let counter = 0;

export function makePlayer(overrides: Partial<ScoredPlayer> = {}): ScoredPlayer {
  counter += 1;
  const base: ScoredPlayer = {
    playerId: overrides.playerId ?? `pl_${counter}`,
    name: overrides.name ?? `Player ${counter}`,
    team: overrides.team ?? "Team A",
    teamShort: overrides.teamShort ?? "A",
    role: overrides.role ?? "BAT",
    credits: overrides.credits ?? 8.5,
    creditsEstimated: overrides.creditsEstimated ?? false,
    battingOrder: overrides.battingOrder ?? null,
    inAnnouncedXI: overrides.inAnnouncedXI ?? true,
    isImpactSub: overrides.isImpactSub ?? false,
    baseScore: overrides.baseScore ?? 40,
    geminiAdjustment: overrides.geminiAdjustment ?? 0,
    expectedPoints: overrides.expectedPoints ?? overrides.baseScore ?? 40,
    features: overrides.features ?? {},
    reason: overrides.reason ?? null,
    riskFlag: overrides.riskFlag ?? null,
  };
  return base;
}

/**
 * Build a two-team squad with a given role layout per team.
 * expectedPoints descend so the optimizer has a clear ranking to find.
 */
export function makeSquad(): ScoredPlayer[] {
  const layout: Dream11Role[] = [
    "WK",
    "BAT",
    "BAT",
    "BAT",
    "BAT",
    "AR",
    "AR",
    "BOWL",
    "BOWL",
    "BOWL",
    "BOWL",
  ];
  const players: ScoredPlayer[] = [];
  for (const team of ["Team A", "Team B"]) {
    layout.forEach((role, i) => {
      const score = 60 - i * 2 - (team === "Team B" ? 1 : 0);
      players.push(
        makePlayer({
          team,
          teamShort: team === "Team A" ? "A" : "B",
          role,
          credits: 8.0 + (i % 4) * 0.5,
          baseScore: score,
          expectedPoints: score,
        }),
      );
    });
  }
  return players;
}
