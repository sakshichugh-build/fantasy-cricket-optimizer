import { describe, it, expect } from "vitest";
import {
  analyzeResiduals,
  battingBand,
  suggestWeightChange,
  type Observation,
} from "@/lib/insights/residuals";

function obs(partial: Partial<Observation>): Observation {
  return {
    predictionId: "p",
    matchId: "m",
    format: "T20",
    pitchType: "balanced",
    role: "BAT",
    battingOrder: 2,
    inAnnouncedXI: true,
    isCaptain: false,
    isViceCaptain: false,
    predicted: 40,
    actual: 40,
    ...partial,
  };
}

describe("battingBand", () => {
  it("maps order to bands", () => {
    expect(battingBand(1)).toBe("top");
    expect(battingBand(5)).toBe("middle");
    expect(battingBand(9)).toBe("lower");
    expect(battingBand(null)).toBe("unknown");
  });
});

describe("analyzeResiduals", () => {
  it("flags a consistently over-rated role segment and suggests a downward weight nudge", () => {
    // 6 BOWL selections predicted 50 but actually ~20 => over-rating by ~30
    const data = Array.from({ length: 6 }, (_, i) =>
      obs({ role: "BOWL", predicted: 50, actual: 20 + (i % 2), matchId: `m${i}` }),
    );
    const insights = analyzeResiduals(data, { minSample: 5, biasThreshold: 6 });
    const roleInsight = insights.find((x) => x.segmentType === "role" && x.segmentValue === "BOWL");
    expect(roleInsight).toBeTruthy();
    expect(roleInsight!.biasDirection).toBe("over");
    expect(roleInsight!.avgResidual).toBeLessThan(0);
    // bowling_workload should be nudged down
    expect(roleInsight!.suggestedWeightChanges.bowling_workload).toBeLessThan(0);
  });

  it("ignores segments below the minimum sample size", () => {
    const data = [obs({ role: "WK", predicted: 60, actual: 10 })];
    const insights = analyzeResiduals(data, { minSample: 5 });
    expect(insights.find((x) => x.segmentValue === "WK")).toBeUndefined();
  });

  it("does not flag well-calibrated segments", () => {
    const data = Array.from({ length: 8 }, (_, i) =>
      obs({ predicted: 40, actual: 41 - (i % 3), matchId: `m${i}` }),
    );
    const insights = analyzeResiduals(data, { minSample: 5, biasThreshold: 6 });
    expect(insights.length).toBe(0);
  });

  it("suggests increasing uncertainty penalty when unconfirmed players are over-rated", () => {
    const change = suggestWeightChange("availability", "unconfirmed", -20, 0.3);
    expect(change.uncertainty_penalty).toBeGreaterThan(0);
  });
});
