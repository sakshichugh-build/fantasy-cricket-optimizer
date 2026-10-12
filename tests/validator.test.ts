import { describe, it, expect } from "vitest";
import { validateDream11Team } from "@/lib/scoring/validator";
import { makePlayer } from "./helpers";
import type { ScoredPlayer } from "@/lib/types";

/** A known-valid Safe-mode 11: 1 WK, 4 BAT, 2 AR, 4 BOWL, 6-5 split, credits ok. */
function validEleven(): ScoredPlayer[] {
  const roles = ["WK", "BAT", "BAT", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL"] as const;
  return roles.map((role, i) =>
    makePlayer({
      playerId: `v_${i}`,
      role,
      team: i < 6 ? "Team A" : "Team B",
      credits: 9.0,
      expectedPoints: 50 - i,
    }),
  );
}

describe("validateDream11Team (safe mode)", () => {
  it("accepts a valid 11 with C/VC", () => {
    const team = validEleven();
    const res = validateDream11Team(team, {
      mode: "safe",
      captainId: team[0].playerId,
      viceCaptainId: team[1].playerId,
    });
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("rejects fewer than 11 players", () => {
    const team = validEleven().slice(0, 10);
    const res = validateDream11Team(team, {
      mode: "safe",
      captainId: team[0].playerId,
      viceCaptainId: team[1].playerId,
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("10"))).toBe(true);
  });

  it("rejects > 7 from one team in safe mode", () => {
    const team = validEleven();
    // move players so 8 are Team A
    team.forEach((p, i) => (p.team = i < 8 ? "Team A" : "Team B"));
    const res = validateDream11Team(team, {
      mode: "safe",
      captainId: team[0].playerId,
      viceCaptainId: team[1].playerId,
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.toLowerCase().includes("team a"))).toBe(true);
  });

  it("rejects a role band violation (0 WK)", () => {
    const team = validEleven();
    team[0].role = "BAT"; // now 0 WK, 5 BAT
    const res = validateDream11Team(team, {
      mode: "safe",
      captainId: team[0].playerId,
      viceCaptainId: team[1].playerId,
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("WK"))).toBe(true);
  });

  it("rejects credits over cap", () => {
    const team = validEleven();
    team.forEach((p) => (p.credits = 10.0)); // 110 total
    const res = validateDream11Team(team, {
      mode: "safe",
      captainId: team[0].playerId,
      viceCaptainId: team[1].playerId,
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.toLowerCase().includes("credit"))).toBe(true);
  });

  it("rejects same captain and vice-captain", () => {
    const team = validEleven();
    const res = validateDream11Team(team, {
      mode: "safe",
      captainId: team[0].playerId,
      viceCaptainId: team[0].playerId,
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.toLowerCase().includes("different"))).toBe(true);
  });

  it("relaxed mode allows 8 BAT which safe mode forbids", () => {
    // 1 WK, 1 AR, 1 BOWL, 8 BAT — relaxed still needs min 1 of every role
    const roles = ["WK", "AR", "BOWL", "BAT", "BAT", "BAT", "BAT", "BAT", "BAT", "BAT", "BAT"] as const;
    const team = roles.map((role, i) =>
      makePlayer({ playerId: `r_${i}`, role, team: i < 6 ? "Team A" : "Team B", credits: 8.0 }),
    );
    const safe = validateDream11Team(team, { mode: "safe", captainId: "r_0", viceCaptainId: "r_1" });
    const relaxed = validateDream11Team(team, { mode: "relaxed", captainId: "r_0", viceCaptainId: "r_1" });
    expect(safe.valid).toBe(false);
    expect(relaxed.valid).toBe(true);
  });
});
