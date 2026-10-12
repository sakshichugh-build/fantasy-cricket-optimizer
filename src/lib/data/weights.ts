import "server-only";
import { getServiceClient } from "../supabase/server";
import { DEFAULT_WEIGHTS, parseWeights, type ScoringWeights } from "../scoring/weights";

export interface WeightVersion {
  version: number;
  weights: ScoringWeights;
  label: string;
  rationale: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Load the active weight version. Falls back to DEFAULT_WEIGHTS (version 0). */
export async function getActiveWeights(): Promise<{ version: number; weights: ScoringWeights }> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("scoring_weights")
    .select("version, weights")
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return { version: 0, weights: DEFAULT_WEIGHTS };
  try {
    return { version: data.version, weights: parseWeights(data.weights) };
  } catch {
    return { version: data.version, weights: DEFAULT_WEIGHTS };
  }
}

export async function getWeightHistory(): Promise<WeightVersion[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("scoring_weights")
    .select("version, weights, label, rationale, is_active, created_at")
    .order("version", { ascending: false });
  if (!data) return [];
  return data.map((r) => ({
    version: r.version,
    weights: safeParse(r.weights),
    label: r.label,
    rationale: r.rationale,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}

export async function getWeightsByVersion(version: number): Promise<ScoringWeights | null> {
  if (version === 0) return DEFAULT_WEIGHTS;
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("scoring_weights")
    .select("weights")
    .eq("version", version)
    .maybeSingle();
  if (!data) return null;
  return safeParse(data.weights);
}

/**
 * Create a new weight version and make it active. Deactivates the current active
 * version first (there is a partial unique index enforcing a single active row).
 */
export async function createWeightVersion(
  weights: ScoringWeights,
  label: string,
  rationale: string,
): Promise<number> {
  const supabase = getServiceClient();
  const { data: maxRow } = await supabase
    .from("scoring_weights")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (maxRow?.version ?? 0) + 1;

  await supabase.from("scoring_weights").update({ is_active: false }).eq("is_active", true);

  const { error } = await supabase.from("scoring_weights").insert({
    version: nextVersion,
    weights: weights as never,
    label,
    rationale,
    is_active: true,
  });
  if (error) throw new Error(`Failed to create weight version: ${error.message}`);
  return nextVersion;
}

/** Activate an existing version (used by rollback). */
export async function activateVersion(version: number): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from("scoring_weights").update({ is_active: false }).eq("is_active", true);
  await supabase.from("scoring_weights").update({ is_active: true }).eq("version", version);
}

function safeParse(raw: unknown): ScoringWeights {
  try {
    return parseWeights(raw);
  } catch {
    return DEFAULT_WEIGHTS;
  }
}
