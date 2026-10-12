import { describe, it, expect } from "vitest";
import { scorePlayer, type PlayerScoringInput } from "@/lib/scoring/engine";
import { DEFAULT_WEIGHTS } from "@/lib/scoring/weights";

const zeroFeatures = {
  formDelta: 0,
  venueDelta: 0,
  oppositionDelta: 0,
  pitchDelta: 0,
  battingPosDelta: 0,
  bowlingDelta: 0,
};

function input(overrides: Partial<PlayerScoringInput> = {}): PlayerScoringInput {
  return {
    playerId: "p1",
    name: "Test",
    team: "Team A",
    role: "BAT",
    credits: 9,
    creditsEstimated: false,
    inAnnouncedXI: true,
    features: { ...zeroFeatures },
    ...overrides,
  };
}

describe("scorePlayer", () => {
  it("uses role base + announced XI bonus with zero features", () => {
    const { player } = scorePlayer(input({ role: "BAT" }), DEFAULT_WEIGHTS);
    // base BAT 30 + announced bonus 4
    expect(player.baseScore).toBe(34);
  });

  it("applies the uncertainty penalty when not in the announced XI", () => {
    const announced = scorePlayer(input({ inAnnouncedXI: true }), DEFAULT_WEIGHTS).player.baseScore;
    const unconfirmed = scorePlayer(input({ inAnnouncedXI: false }), DEFAULT_WEIGHTS).player.baseScore;
    // difference = announced bonus (4) + penalty (10) = 14
    expect(announced - unconfirmed).toBeCloseTo(14, 5);
  });

  it("gives all-rounders the AR bonus", () => {
    const bat = scorePlayer(input({ role: "BAT" }), DEFAULT_WEIGHTS).player.baseScore;
    const ar = scorePlayer(input({ role: "AR" }), DEFAULT_WEIGHTS).player.baseScore;
    // AR base 34 + AR bonus 6 = 40 ; BAT base 30 = 34 -> diff 6? base differs too
    // AR = 34 + 6 + 4(announced) = 44 ; BAT = 30 + 4 = 34
    expect(ar).toBe(44);
    expect(bat).toBe(34);
  });

  it("weights feature deltas and reports a breakdown", () => {
    const { player } = scorePlayer(
      input({ features: { ...zeroFeatures, formDelta: 10 } }),
      DEFAULT_WEIGHTS,
    );
    // base 30 + announced 4 + recent_form(1.0 * 10) = 44
    expect(player.baseScore).toBe(44);
    expect(player.features.recent_form).toBe(10);
  });

  it("never returns a negative score", () => {
    const { player } = scorePlayer(
      input({ inAnnouncedXI: false, features: { ...zeroFeatures, formDelta: -1000 } }),
      DEFAULT_WEIGHTS,
    );
    expect(player.baseScore).toBeGreaterThanOrEqual(0);
  });
});
