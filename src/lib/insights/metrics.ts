import "server-only";
import { getServiceClient } from "../supabase/server";
import { battingBand } from "./residuals";
import { getWeightHistory, type WeightVersion } from "../data/weights";

export interface SegmentAccuracy {
  value: string;
  sampleSize: number;
  mae: number;
  avgResidual: number;
}

export interface BiggestMiss {
  playerName: string;
  matchName: string;
  predicted: number;
  actual: number;
  residual: number;
}

export interface ErrorPoint {
  label: string;
  predictedTotal: number;
  actualTotal: number;
  mae: number;
  weightVersion: number;
}

export interface InsightRow {
  id: string;
  segmentType: string;
  segmentValue: string;
  sampleSize: number;
  avgResidual: number;
  meanAbsError: number;
  biasDirection: string | null;
  detail: string | null;
  geminiExplanation: string | null;
  suggestedWeightChanges: Record<string, number> | null;
  status: string;
  appliedWeightVersion: number | null;
}

export interface InsightsDashboard {
  hasData: boolean;
  totalPredictionsScored: number;
  totalObservations: number;
  overall: { mae: number; avgResidual: number; bias: "over" | "under" | "none" };
  byFormat: SegmentAccuracy[];
  byRole: SegmentAccuracy[];
  byVenueType: SegmentAccuracy[];
  byBattingBand: SegmentAccuracy[];
  captainHitRate: number | null;
  viceCaptainHitRate: number | null;
  cvcEitherHitRate: number | null;
  biggestMisses: BiggestMiss[];
  errorOverTime: ErrorPoint[];
  accuracyByWeightVersion: { version: number; mae: number; sampleSize: number }[];
  openInsights: InsightRow[];
  appliedInsights: InsightRow[];
  weightHistory: WeightVersion[];
}

function agg(rows: { predicted: number; actual: number }[]): { mae: number; avgResidual: number } {
  if (rows.length === 0) return { mae: 0, avgResidual: 0 };
  const mae = rows.reduce((s, r) => s + Math.abs(r.actual - r.predicted), 0) / rows.length;
  const avg = rows.reduce((s, r) => s + (r.actual - r.predicted), 0) / rows.length;
  return { mae: round1(mae), avgResidual: round1(avg) };
}

function segmentAccuracy<T extends string>(
  items: { key: T; predicted: number; actual: number }[],
): SegmentAccuracy[] {
  const groups = new Map<string, { predicted: number; actual: number }[]>();
  for (const it of items) {
    if (!groups.has(it.key)) groups.set(it.key, []);
    groups.get(it.key)!.push(it);
  }
  return [...groups.entries()]
    .map(([value, rows]) => ({ value, sampleSize: rows.length, ...agg(rows) }))
    .sort((a, b) => b.sampleSize - a.sampleSize);
}

export async function getInsightsDashboard(): Promise<InsightsDashboard> {
  const supabase = getServiceClient();
  const weightHistory = await getWeightHistory();

  const { data: insightRows } = await supabase
    .from("insights")
    .select("*")
    .order("created_at", { ascending: false });
  const mapInsight = (r: Record<string, unknown>): InsightRow => ({
    id: r.id as string,
    segmentType: r.segment_type as string,
    segmentValue: r.segment_value as string,
    sampleSize: r.sample_size as number,
    avgResidual: Number(r.avg_residual),
    meanAbsError: Number(r.mean_abs_error),
    biasDirection: r.bias_direction as string | null,
    detail: r.detail as string | null,
    geminiExplanation: r.gemini_explanation as string | null,
    suggestedWeightChanges: r.suggested_weight_changes as Record<string, number> | null,
    status: r.status as string,
    appliedWeightVersion: r.applied_weight_version as number | null,
  });
  const openInsights = (insightRows ?? []).filter((r) => r.status === "open").map(mapInsight);
  const appliedInsights = (insightRows ?? []).filter((r) => r.status === "applied").map(mapInsight);

  const { data: preds } = await supabase
    .from("predictions")
    .select("id, match_id, weight_version, created_at, gemini_reasoning")
    .order("created_at", { ascending: true });

  if (!preds || preds.length === 0) {
    return emptyDashboard(weightHistory, openInsights, appliedInsights);
  }

  const matchIds = [...new Set(preds.map((p) => p.match_id))];
  const { data: matches } = await supabase
    .from("matches")
    .select("id, name, format")
    .in("id", matchIds);
  const matchById = new Map((matches ?? []).map((m) => [m.id, m]));

  const predIds = preds.map((p) => p.id);
  const { data: players } = await supabase
    .from("prediction_players")
    .select("prediction_id, player_id, player_name, role, batting_order, predicted_points, is_captain, is_vice_captain")
    .in("prediction_id", predIds)
    .eq("selected", true);
  const { data: actuals } = await supabase
    .from("actual_points")
    .select("prediction_id, player_id, actual_points")
    .in("prediction_id", predIds);
  const actualMap = new Map(
    (actuals ?? []).map((a) => [`${a.prediction_id}:${a.player_id}`, Number(a.actual_points)]),
  );

  const predMeta = new Map(
    preds.map((p) => [
      p.id,
      {
        weightVersion: p.weight_version,
        format: matchById.get(p.match_id)?.format ?? "T20",
        name: matchById.get(p.match_id)?.name ?? "Match",
        pitchType: ((p.gemini_reasoning ?? {}) as { pitchType?: string }).pitchType ?? "unknown",
      },
    ]),
  );

  interface Row {
    predictionId: string;
    predicted: number;
    actual: number;
    role: string;
    battingOrder: number | null;
    format: string;
    pitchType: string;
    playerName: string;
    isCaptain: boolean;
    isViceCaptain: boolean;
    weightVersion: number;
    matchName: string;
  }
  const rows: Row[] = [];
  for (const pl of players ?? []) {
    const actual = actualMap.get(`${pl.prediction_id}:${pl.player_id}`);
    if (actual == null) continue;
    const meta = predMeta.get(pl.prediction_id)!;
    rows.push({
      predictionId: pl.prediction_id,
      predicted: Number(pl.predicted_points),
      actual,
      role: pl.role,
      battingOrder: pl.batting_order,
      format: meta.format,
      pitchType: meta.pitchType,
      playerName: pl.player_name,
      isCaptain: pl.is_captain,
      isViceCaptain: pl.is_vice_captain,
      weightVersion: meta.weightVersion,
      matchName: meta.name,
    });
  }

  if (rows.length === 0) {
    return emptyDashboard(weightHistory, openInsights, appliedInsights, preds.length);
  }

  const overallAgg = agg(rows);
  const overallBias: "over" | "under" | "none" =
    overallAgg.avgResidual <= -4 ? "over" : overallAgg.avgResidual >= 4 ? "under" : "none";

  // C/VC hit rate: did C/VC finish in their team's actual top 2 (among selected w/ actuals)?
  const byPred = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byPred.has(r.predictionId)) byPred.set(r.predictionId, []);
    byPred.get(r.predictionId)!.push(r);
  }
  let capHits = 0;
  let vcHits = 0;
  let eitherHits = 0;
  let cvcEval = 0;
  for (const group of byPred.values()) {
    if (group.length < 2) continue;
    cvcEval += 1;
    const top2 = [...group].sort((a, b) => b.actual - a.actual).slice(0, 2).map((r) => r.playerName);
    const cap = group.find((r) => r.isCaptain);
    const vc = group.find((r) => r.isViceCaptain);
    const capHit = cap ? top2.includes(cap.playerName) : false;
    const vcHit = vc ? top2.includes(vc.playerName) : false;
    if (capHit) capHits += 1;
    if (vcHit) vcHits += 1;
    if (capHit || vcHit) eitherHits += 1;
  }

  const biggestMisses: BiggestMiss[] = [...rows]
    .sort((a, b) => Math.abs(b.actual - b.predicted) - Math.abs(a.actual - a.predicted))
    .slice(0, 8)
    .map((r) => ({
      playerName: r.playerName,
      matchName: r.matchName,
      predicted: round1(r.predicted),
      actual: round1(r.actual),
      residual: round1(r.actual - r.predicted),
    }));

  const errorOverTime: ErrorPoint[] = [...byPred.entries()].map(([pid, group]) => {
    const predictedTotal = round1(group.reduce((s, r) => s + r.predicted, 0));
    const actualTotal = round1(group.reduce((s, r) => s + r.actual, 0));
    const { mae } = agg(group);
    return {
      label: group[0].matchName.slice(0, 22),
      predictedTotal,
      actualTotal,
      mae,
      weightVersion: group[0].weightVersion,
    };
  });

  const versionGroups = new Map<number, Row[]>();
  for (const r of rows) {
    if (!versionGroups.has(r.weightVersion)) versionGroups.set(r.weightVersion, []);
    versionGroups.get(r.weightVersion)!.push(r);
  }
  const accuracyByWeightVersion = [...versionGroups.entries()]
    .map(([version, rs]) => ({ version, mae: agg(rs).mae, sampleSize: rs.length }))
    .sort((a, b) => a.version - b.version);

  return {
    hasData: true,
    totalPredictionsScored: byPred.size,
    totalObservations: rows.length,
    overall: { ...overallAgg, bias: overallBias },
    byFormat: segmentAccuracy(rows.map((r) => ({ key: r.format, predicted: r.predicted, actual: r.actual }))),
    byRole: segmentAccuracy(rows.map((r) => ({ key: r.role, predicted: r.predicted, actual: r.actual }))),
    byVenueType: segmentAccuracy(rows.map((r) => ({ key: r.pitchType, predicted: r.predicted, actual: r.actual }))),
    byBattingBand: segmentAccuracy(rows.map((r) => ({ key: battingBand(r.battingOrder), predicted: r.predicted, actual: r.actual }))),
    captainHitRate: cvcEval ? round2(capHits / cvcEval) : null,
    viceCaptainHitRate: cvcEval ? round2(vcHits / cvcEval) : null,
    cvcEitherHitRate: cvcEval ? round2(eitherHits / cvcEval) : null,
    biggestMisses,
    errorOverTime,
    accuracyByWeightVersion,
    openInsights,
    appliedInsights,
    weightHistory,
  };
}

function emptyDashboard(
  weightHistory: WeightVersion[],
  openInsights: InsightRow[],
  appliedInsights: InsightRow[],
  totalPredictionsScored = 0,
): InsightsDashboard {
  return {
    hasData: false,
    totalPredictionsScored,
    totalObservations: 0,
    overall: { mae: 0, avgResidual: 0, bias: "none" },
    byFormat: [],
    byRole: [],
    byVenueType: [],
    byBattingBand: [],
    captainHitRate: null,
    viceCaptainHitRate: null,
    cvcEitherHitRate: null,
    biggestMisses: [],
    errorOverTime: [],
    accuracyByWeightVersion: [],
    openInsights,
    appliedInsights,
    weightHistory,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
