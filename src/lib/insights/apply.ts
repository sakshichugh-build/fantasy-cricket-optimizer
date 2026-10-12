import "server-only";
import { getServiceClient } from "../supabase/server";
import {
  TUNABLE_WEIGHT_KEYS,
  WEIGHT_BOUNDS,
  type ScoringWeights,
  type TunableWeightKey,
} from "../scoring/weights";
import { getActiveWeights, createWeightVersion, activateVersion } from "../data/weights";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Apply bounded weight changes to a weights object (returns a new object). */
export function applyChanges(
  weights: ScoringWeights,
  changes: Partial<Record<TunableWeightKey, number>>,
): ScoringWeights {
  const next: ScoringWeights = { ...weights, base_by_role: { ...weights.base_by_role } };
  for (const key of TUNABLE_WEIGHT_KEYS) {
    const delta = changes[key];
    if (typeof delta !== "number" || delta === 0) continue;
    const bounds = WEIGHT_BOUNDS[key];
    next[key] = Math.round(clamp(weights[key] + delta, bounds.min, bounds.max) * 100) / 100;
  }
  return next;
}

export interface ApplyResult {
  newVersion: number;
  before: ScoringWeights;
  after: ScoringWeights;
}

/** Apply an insight's suggested weight change, creating a new active weight version. */
export async function applyInsight(insightId: string): Promise<ApplyResult> {
  const supabase = getServiceClient();
  const { data: insight } = await supabase
    .from("insights")
    .select("*")
    .eq("id", insightId)
    .maybeSingle();
  if (!insight) throw new Error("Insight not found");
  if (insight.status === "applied") throw new Error("Insight already applied");

  const { weights: before } = await getActiveWeights();
  const changes = (insight.suggested_weight_changes ?? {}) as Partial<
    Record<TunableWeightKey, number>
  >;
  const after = applyChanges(before, changes);

  const changeSummary = Object.entries(changes)
    .map(([k, v]) => `${k} ${v! > 0 ? "+" : ""}${v}`)
    .join(", ");
  const rationale = `${insight.detail} → ${changeSummary || "no change"}`;

  const newVersion = await createWeightVersion(after, "learned", rationale);

  await supabase
    .from("insights")
    .update({ status: "applied", applied_weight_version: newVersion })
    .eq("id", insightId);

  return { newVersion, before, after };
}

export async function dismissInsight(insightId: string): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from("insights").update({ status: "dismissed" }).eq("id", insightId);
}

export async function rollbackToVersion(version: number): Promise<void> {
  await activateVersion(version);
}
