import "server-only";
import { getServiceClient } from "../supabase/server";
import {
  CAPTAIN_MULTIPLIER,
  VICE_CAPTAIN_MULTIPLIER,
  type Dream11Role,
  type RuleMode,
} from "../types";
import type { AnalysisResult } from "../pipeline/analyze";

export interface SavedPredictionPlayer {
  playerId: string;
  name: string;
  team: string | null;
  role: Dream11Role;
  credits: number;
  selected: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  baseScore: number;
  geminiAdjustment: number;
  predictedPoints: number;
  predictedPointsEffective: number;
  inAnnouncedXI: boolean;
  reason: string | null;
  riskFlag: string | null;
  battingOrder: number | null;
  actualPoints: number | null;
}

export interface SavedPrediction {
  id: string;
  matchId: string;
  weightVersion: number;
  ruleMode: RuleMode;
  captainPlayerId: string | null;
  viceCaptainPlayerId: string | null;
  geminiReasoning: Record<string, unknown> | null;
  geminiModel: string | null;
  usedGrounding: boolean;
  totalPredictedPoints: number;
  totalCredits: number;
  teamSplit: string | null;
  isSeed: boolean;
  createdAt: string;
  players: SavedPredictionPlayer[];
}

/** Persist an analysis as a prediction (+ players). Keeps prediction id stable
 * per match so previously entered actual points are preserved on re-analysis. */
export async function savePrediction(
  analysis: AnalysisResult,
  opts: { isSeed?: boolean } = {},
): Promise<string> {
  const supabase = getServiceClient();
  const { match, team, mode, weightVersion, reasoning } = analysis;

  const reasoningJson = {
    contextNote: reasoning.contextNote,
    shareableSummary: reasoning.shareableSummary,
    captainReason: reasoning.captainReason,
    viceCaptainReason: reasoning.viceCaptainReason,
    grounded: reasoning.grounded,
    geminiUsed: reasoning.used,
    contextSummary: analysis.context.summary,
    contextSources: analysis.context.sources,
    pitchType: analysis.context.pitchType,
  };

  const { data: existing } = await supabase
    .from("predictions")
    .select("id")
    .eq("match_id", match.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let predictionId: string;
  const baseRow = {
    match_id: match.id,
    weight_version: weightVersion,
    rule_mode: mode,
    captain_player_id: team.captainId,
    vice_captain_player_id: team.viceCaptainId,
    gemini_reasoning: reasoningJson as never,
    gemini_model: reasoning.model || null,
    used_grounding: reasoning.grounded,
    total_predicted_points: team.totalEffectivePoints,
    total_credits: team.totalCredits,
    team_split: team.teamSplit,
    is_seed: opts.isSeed ?? false,
  };

  if (existing) {
    predictionId = existing.id;
    await supabase.from("predictions").update(baseRow).eq("id", predictionId);
    await supabase.from("prediction_players").delete().eq("prediction_id", predictionId);
  } else {
    const { data, error } = await supabase
      .from("predictions")
      .insert(baseRow)
      .select("id")
      .single();
    if (error) throw new Error(`savePrediction failed: ${error.message}`);
    predictionId = data.id;
  }

  // Persist the full scored pool: the 11 (selected) + everyone else (bench),
  // so the Team view can offer valid swaps.
  const selectedIds = new Set(team.players.map((p) => p.playerId));
  const rows = [
    ...team.players.map((p) => playerRow(predictionId, p, team.captainId, team.viceCaptainId, true)),
    ...analysis.scored
      .filter((p) => !selectedIds.has(p.playerId))
      .map((p) => playerRow(predictionId, p, null, null, false)),
  ];
  const { error: ppErr } = await supabase.from("prediction_players").insert(rows);
  if (ppErr) throw new Error(`savePrediction players failed: ${ppErr.message}`);

  return predictionId;
}

function playerRow(
  predictionId: string,
  p: AnalysisResult["team"]["players"][number],
  captainId: string | null,
  viceCaptainId: string | null,
  selected: boolean,
) {
  const isCaptain = p.playerId === captainId;
  const isVice = p.playerId === viceCaptainId;
  const mult = isCaptain ? CAPTAIN_MULTIPLIER : isVice ? VICE_CAPTAIN_MULTIPLIER : 1;
  return {
    prediction_id: predictionId,
    player_id: p.playerId,
    player_name: p.name,
    team: p.team,
    role: p.role,
    credits: p.credits,
    batting_order: p.battingOrder ?? null,
    selected,
    is_captain: isCaptain,
    is_vice_captain: isVice,
    base_score: p.baseScore,
    gemini_adjustment: p.geminiAdjustment,
    predicted_points: p.expectedPoints,
    predicted_points_effective: Math.round(p.expectedPoints * mult * 100) / 100,
    in_announced_xi: p.inAnnouncedXI,
    reason: p.reason ?? null,
    risk_flag: p.riskFlag ?? null,
  };
}

export async function getPredictionForMatch(matchId: string): Promise<SavedPrediction | null> {
  const supabase = getServiceClient();
  const { data: pred } = await supabase
    .from("predictions")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pred) return null;
  return hydrate(pred);
}

export async function getPredictionById(id: string): Promise<SavedPrediction | null> {
  const supabase = getServiceClient();
  const { data: pred } = await supabase.from("predictions").select("*").eq("id", id).maybeSingle();
  if (!pred) return null;
  return hydrate(pred);
}

async function hydrate(pred: Record<string, unknown>): Promise<SavedPrediction> {
  const supabase = getServiceClient();
  const id = pred.id as string;
  const { data: players } = await supabase
    .from("prediction_players")
    .select("*")
    .eq("prediction_id", id)
    .order("predicted_points", { ascending: false });
  const { data: actuals } = await supabase
    .from("actual_points")
    .select("player_id, actual_points")
    .eq("prediction_id", id);
  const actualMap = new Map((actuals ?? []).map((a) => [a.player_id, Number(a.actual_points)]));

  return {
    id,
    matchId: pred.match_id as string,
    weightVersion: pred.weight_version as number,
    ruleMode: pred.rule_mode as RuleMode,
    captainPlayerId: pred.captain_player_id as string | null,
    viceCaptainPlayerId: pred.vice_captain_player_id as string | null,
    geminiReasoning: pred.gemini_reasoning as Record<string, unknown> | null,
    geminiModel: pred.gemini_model as string | null,
    usedGrounding: pred.used_grounding as boolean,
    totalPredictedPoints: Number(pred.total_predicted_points),
    totalCredits: Number(pred.total_credits),
    teamSplit: pred.team_split as string | null,
    isSeed: pred.is_seed as boolean,
    createdAt: pred.created_at as string,
    players: (players ?? []).map((r) => ({
      playerId: r.player_id,
      name: r.player_name,
      team: r.team,
      role: r.role as Dream11Role,
      credits: Number(r.credits),
      selected: r.selected,
      isCaptain: r.is_captain,
      isViceCaptain: r.is_vice_captain,
      baseScore: Number(r.base_score),
      geminiAdjustment: Number(r.gemini_adjustment),
      predictedPoints: Number(r.predicted_points),
      predictedPointsEffective: Number(r.predicted_points_effective),
      inAnnouncedXI: r.in_announced_xi,
      reason: r.reason,
      riskFlag: r.risk_flag,
      battingOrder: r.batting_order,
      actualPoints: actualMap.get(r.player_id) ?? null,
    })),
  };
}

/**
 * Re-save a manually edited team (swaps / changed C-VC). Re-validates server-side
 * and refuses to persist an invalid team. Returns the validation result.
 */
export async function resaveTeam(
  predictionId: string,
  input: { selectedIds: string[]; captainId: string; viceCaptainId: string; mode: RuleMode },
): Promise<import("../types").ValidationResult> {
  const supabase = getServiceClient();
  const { data: rows } = await supabase
    .from("prediction_players")
    .select("*")
    .eq("prediction_id", predictionId);
  if (!rows) throw new Error("Prediction not found");

  const selectedSet = new Set(input.selectedIds);
  const selectedRows = rows.filter((r) => selectedSet.has(r.player_id));

  const scored = selectedRows.map((r) => ({
    playerId: r.player_id,
    name: r.player_name,
    team: r.team ?? "",
    teamShort: null,
    role: r.role as Dream11Role,
    credits: Number(r.credits),
    creditsEstimated: true,
    battingOrder: r.batting_order,
    inAnnouncedXI: r.in_announced_xi,
    isImpactSub: false,
    baseScore: Number(r.base_score),
    geminiAdjustment: Number(r.gemini_adjustment),
    expectedPoints: Number(r.predicted_points),
    features: {},
    reason: r.reason,
    riskFlag: r.risk_flag,
  }));

  const { validateDream11Team } = await import("../scoring/validator");
  const validation = validateDream11Team(scored, {
    mode: input.mode,
    captainId: input.captainId,
    viceCaptainId: input.viceCaptainId,
  });
  if (!validation.valid) return validation;

  // Persist new selection + C/VC + recomputed totals.
  for (const r of rows) {
    const selected = selectedSet.has(r.player_id);
    const isCap = r.player_id === input.captainId;
    const isVc = r.player_id === input.viceCaptainId;
    const mult = isCap ? CAPTAIN_MULTIPLIER : isVc ? VICE_CAPTAIN_MULTIPLIER : 1;
    await supabase
      .from("prediction_players")
      .update({
        selected,
        is_captain: selected && isCap,
        is_vice_captain: selected && isVc,
        predicted_points_effective: Math.round(Number(r.predicted_points) * mult * 100) / 100,
      })
      .eq("id", r.id);
  }

  const totalExpected = selectedRows.reduce((s, r) => s + Number(r.predicted_points), 0);
  const capPts = Number(selectedRows.find((r) => r.player_id === input.captainId)?.predicted_points ?? 0);
  const vcPts = Number(selectedRows.find((r) => r.player_id === input.viceCaptainId)?.predicted_points ?? 0);
  const totalEffective = totalExpected + capPts + 0.5 * vcPts;
  const totalCredits = selectedRows.reduce((s, r) => s + Number(r.credits), 0);
  const teamCounts = new Map<string, number>();
  for (const r of selectedRows) teamCounts.set(r.team ?? "", (teamCounts.get(r.team ?? "") ?? 0) + 1);
  const teamSplit = [...teamCounts.values()].sort((a, b) => b - a).join("-");

  await supabase
    .from("predictions")
    .update({
      captain_player_id: input.captainId,
      vice_captain_player_id: input.viceCaptainId,
      rule_mode: input.mode,
      total_predicted_points: Math.round(totalEffective * 100) / 100,
      total_credits: Math.round(totalCredits * 10) / 10,
      team_split: teamSplit,
    })
    .eq("id", predictionId);

  return validation;
}

/** Save actual Dream11 points for selected players (manual entry = source of truth). */
export async function saveActuals(
  predictionId: string,
  entries: { playerId: string; playerName: string; points: number }[],
  opts: { isSeed?: boolean } = {},
): Promise<void> {
  const supabase = getServiceClient();
  const rows = entries.map((e) => ({
    prediction_id: predictionId,
    player_id: e.playerId,
    player_name: e.playerName,
    actual_points: e.points,
    is_seed: opts.isSeed ?? false,
  }));
  const { error } = await supabase
    .from("actual_points")
    .upsert(rows, { onConflict: "prediction_id,player_id" });
  if (error) throw new Error(`saveActuals failed: ${error.message}`);
}
