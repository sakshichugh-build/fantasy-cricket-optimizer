import "server-only";
import { z } from "zod";
import { getServiceClient } from "../supabase/server";
import type { Dream11Role, MatchFormat } from "../types";
import { analyzeResiduals, type Observation, type SegmentInsight } from "./residuals";
import { generateStructured } from "../ai/gemini";

/** Build predicted-vs-actual observations from all completed, scored predictions. */
export async function buildObservations(): Promise<Observation[]> {
  const supabase = getServiceClient();
  const { data: preds } = await supabase
    .from("predictions")
    .select("id, match_id, gemini_reasoning");
  if (!preds || preds.length === 0) return [];

  const matchIds = [...new Set(preds.map((p) => p.match_id))];
  const { data: matches } = await supabase
    .from("matches")
    .select("id, format")
    .in("id", matchIds);
  const formatById = new Map((matches ?? []).map((m) => [m.id, m.format as MatchFormat]));

  const predIds = preds.map((p) => p.id);
  const { data: players } = await supabase
    .from("prediction_players")
    .select("prediction_id, player_id, role, batting_order, in_announced_xi, predicted_points, is_captain, is_vice_captain")
    .in("prediction_id", predIds)
    .eq("selected", true);
  const { data: actuals } = await supabase
    .from("actual_points")
    .select("prediction_id, player_id, actual_points")
    .in("prediction_id", predIds);

  const actualMap = new Map(
    (actuals ?? []).map((a) => [`${a.prediction_id}:${a.player_id}`, Number(a.actual_points)]),
  );
  const pitchByPred = new Map(
    preds.map((p) => {
      const r = (p.gemini_reasoning ?? {}) as { pitchType?: string };
      return [p.id, r.pitchType ?? "unknown"];
    }),
  );

  const obs: Observation[] = [];
  for (const pl of players ?? []) {
    const actual = actualMap.get(`${pl.prediction_id}:${pl.player_id}`);
    if (actual == null) continue;
    obs.push({
      predictionId: pl.prediction_id,
      matchId: "",
      format: formatById.get(preds.find((p) => p.id === pl.prediction_id)!.match_id) ?? "T20",
      pitchType: pitchByPred.get(pl.prediction_id) ?? "unknown",
      role: pl.role as Dream11Role,
      battingOrder: pl.batting_order,
      inAnnouncedXI: pl.in_announced_xi,
      isCaptain: pl.is_captain,
      isViceCaptain: pl.is_vice_captain,
      predicted: Number(pl.predicted_points),
      actual,
    });
  }
  return obs;
}

const explanationSchema = z.object({
  explanations: z.array(z.object({ key: z.string(), text: z.string() })),
});

const explanationResponseSchema = {
  type: "object",
  properties: {
    explanations: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, text: { type: "string" } },
        required: ["key", "text"],
      },
    },
  },
  required: ["explanations"],
};

async function explain(insights: SegmentInsight[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (insights.length === 0) return map;
  try {
    const lines = insights
      .map(
        (i) =>
          `key=${i.segmentType}:${i.segmentValue} | ${i.detail} | suggested: ${JSON.stringify(i.suggestedWeightChanges)}`,
      )
      .join("\n");
    const res = await generateStructured({
      contents: `These are detected biases in a Dream11 scoring model and the proposed weight nudges:\n${lines}\n\nFor each key, write one plain-English sentence explaining the pattern and why the weight change helps. Echo the key exactly.`,
      system: "You explain fantasy-cricket model adjustments to a non-technical user, concisely.",
      responseSchema: explanationResponseSchema,
      validator: explanationSchema,
      temperature: 0.4,
      timeoutMs: 30000,
      retries: 1,
    });
    for (const e of res.explanations) map.set(e.key, e.text);
  } catch {
    /* fall back to templated detail */
  }
  return map;
}

export interface ComputeResult {
  observations: number;
  insights: number;
  geminiExplained: boolean;
}

/**
 * Recompute insights from current data and store them (replacing prior OPEN
 * insights; applied/dismissed ones are kept). Adds Gemini plain-English
 * explanations where possible.
 */
export async function computeAndStoreInsights(opts?: {
  minSample?: number;
  biasThreshold?: number;
}): Promise<ComputeResult> {
  const supabase = getServiceClient();
  const obs = await buildObservations();
  const insights = analyzeResiduals(obs, {
    minSample: opts?.minSample ?? 5,
    biasThreshold: opts?.biasThreshold ?? 6,
  });

  const explanations = await explain(insights);

  // Replace previous OPEN insights only.
  await supabase.from("insights").delete().eq("status", "open");

  if (insights.length > 0) {
    const rows = insights.map((i) => ({
      segment_type: i.segmentType,
      segment_value: i.segmentValue,
      sample_size: i.sampleSize,
      avg_residual: i.avgResidual,
      mean_abs_error: i.meanAbsError,
      bias_direction: i.biasDirection,
      detail: i.detail,
      suggested_weight_changes: i.suggestedWeightChanges as never,
      gemini_explanation: explanations.get(`${i.segmentType}:${i.segmentValue}`) ?? i.detail,
      status: "open",
    }));
    await supabase.from("insights").insert(rows);
  }

  return {
    observations: obs.length,
    insights: insights.length,
    geminiExplained: explanations.size > 0,
  };
}
