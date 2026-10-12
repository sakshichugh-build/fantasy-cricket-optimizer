import { describe, it, expect } from "vitest";
import { optimizeTeam } from "@/lib/scoring/optimizer";
import { validateDream11Team } from "@/lib/scoring/validator";
import { makeSquad, makePlayer } from "./helpers";
import type { Dream11Role, ScoredPlayer } from "@/lib/types";

describe("optimizeTeam", () => {
  it("returns a valid 11 for a normal squad", () => {
    const squad = makeSquad();
    const { team, infeasibleReason } = optimizeTeam(squad, { mode: "safe" });
    expect(infeasibleReason).toBeUndefined();
    expect(team).not.toBeNull();
    expect(team!.players).toHaveLength(11);

    const res = validateDream11Team(team!.players, {
      mode: "safe",
      captainId: team!.captainId,
      viceCaptainId: team!.viceCaptainId,
    });
    expect(res.valid).toBe(true);
  });

  it("assigns captain and vice-captain to the two highest expected scorers", () => {
    const squad = makeSquad();
    const { team } = optimizeTeam(squad, { mode: "safe" });
    const selected = team!.players;
    const sorted = [...selected].sort((a, b) => b.expectedPoints - a.expectedPoints);
    expect(team!.captainId).toBe(sorted[0].playerId);
    expect(team!.viceCaptainId).toBe(sorted[1].playerId);
    expect(team!.captainId).not.toBe(team!.viceCaptainId);
  });

  it("respects the credit cap (safe mode, estimated => <= 99.5)", () => {
    const squad = makeSquad().map((p) => ({ ...p, creditsEstimated: true }));
    const { team } = optimizeTeam(squad, { mode: "safe" });
    expect(team).not.toBeNull();
    expect(team!.totalCredits).toBeLessThanOrEqual(99.5 + 1e-9);
  });

  it("never exceeds 7 from one team in safe mode", () => {
    const squad = makeSquad();
    const { team } = optimizeTeam(squad, { mode: "safe" });
    const counts = new Map<string, number>();
    for (const p of team!.players) counts.set(p.team, (counts.get(p.team) ?? 0) + 1);
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(7);
  });

  it("prefers higher-scoring players (a star gets selected)", () => {
    const squad = makeSquad();
    const star = makePlayer({
      playerId: "star",
      role: "AR",
      team: "Team A",
      credits: 9.0,
      baseScore: 200,
      expectedPoints: 200,
    });
    const { team } = optimizeTeam([...squad, star], { mode: "safe" });
    expect(team!.players.some((p) => p.playerId === "star")).toBe(true);
    expect(team!.captainId).toBe("star");
  });

  it("reports infeasible when a required role is missing", () => {
    // all BAT => cannot satisfy WK min 1, BOWL min 3, AR min 1
    const squad: ScoredPlayer[] = Array.from({ length: 22 }, (_, i) =>
      makePlayer({ playerId: `b_${i}`, role: "BAT" as Dream11Role, team: i < 11 ? "Team A" : "Team B" }),
    );
    const { team, infeasibleReason } = optimizeTeam(squad, { mode: "safe" });
    expect(team).toBeNull();
    expect(infeasibleReason).toBeTruthy();
  });
});
