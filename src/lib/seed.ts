import "server-only";
import { syncMatches, listMatches, ensureMatchSquad } from "./data/matches";
import { analyzeMatch } from "./pipeline/analyze";
import { savePrediction, saveActuals, getPredictionForMatch } from "./data/predictions";
import { computeAndStoreInsights } from "./insights/compute";
import type { Dream11Role } from "./types";

/**
 * Deterministic pseudo-random generator so seeded actuals are reproducible.
 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a plausible actual Dream11 score for a selected player, injecting a
 * deliberate, detectable bias (the model over-rates BOWLers and under-rates
 * WKs) plus noise — so the learning loop has a real pattern to surface. These
 * are clearly stored with is_seed = true (not user-entered).
 */
function seededActual(role: Dream11Role, predicted: number, rnd: () => number): number {
  // Deliberate, detectable bias: the model over-rates batters and under-rates
  // wicket-keepers — surfaced by the learning loop as a weight suggestion.
  const roleBias: Record<Dream11Role, number> = { BAT: -11, WK: 7, BOWL: -4, AR: 1 };
  const noise = (rnd() - 0.5) * 16;
  const val = predicted + roleBias[role] + noise;
  return Math.max(0, Math.round(val));
}

export interface SeedResult {
  synced: number;
  seededMatches: number;
  matches: { name: string; predictionId: string; players: number }[];
  insights: { observations: number; insights: number };
  error?: string;
}

/**
 * Seed the database from real recent COMPLETED matches: run the full pipeline
 * (deterministic scoring + optimizer + validator; Gemini skipped for speed and
 * quota), then store seeded actual points and compute insights so the dashboard
 * is populated at submission time.
 */
export async function seedDatabase(opts: { count?: number } = {}): Promise<SeedResult> {
  const count = opts.count ?? 6;
  const sync = await syncMatches();

  // Only matches that actually have squads available (free tier returns squads
  // only for these) — avoids slow empty squad fetches that blow the time budget.
  const completed = (await listMatches({ status: "completed" })).filter(
    (m) => m.teamA && m.teamB && m.hasSquads,
  );

  const seededMatches: SeedResult["matches"] = [];
  const rnd = mulberry32(42);

  for (const m of completed) {
    if (seededMatches.length >= count) break;
    try {
      const { match, squad, squadsAvailable } = await ensureMatchSquad(m.id);
      if (!squadsAvailable || squad.length < 13) continue;

      // Safe mode first; fall back to Relaxed if a sparse squad makes Safe
      // infeasible (common for associate-nation role data).
      let analysis;
      try {
        analysis = await analyzeMatch(match, squad, { mode: "safe", skipGemini: true });
      } catch {
        analysis = await analyzeMatch(match, squad, { mode: "relaxed", skipGemini: true });
      }
      const predictionId = await savePrediction(analysis, { isSeed: true });

      const saved = await getPredictionForMatch(m.id);
      const selected = (saved?.players ?? []).filter((p) => p.selected);
      const entries = selected.map((p) => ({
        playerId: p.playerId,
        playerName: p.name,
        points: seededActual(p.role, p.predictedPoints, rnd),
      }));
      await saveActuals(predictionId, entries, { isSeed: true });

      seededMatches.push({ name: match.name, predictionId, players: entries.length });
    } catch {
      // skip matches whose squads/analysis fail
      continue;
    }
  }

  const insights = await computeAndStoreInsights({ minSample: 5, biasThreshold: 6, skipExplain: true });

  return {
    synced: sync.synced,
    seededMatches: seededMatches.length,
    matches: seededMatches,
    insights: { observations: insights.observations, insights: insights.insights },
    error: sync.error,
  };
}
