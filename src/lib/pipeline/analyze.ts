import "server-only";
import type { RuleMode, ScoredPlayer, SelectedTeam, ValidationResult } from "../types";
import type { IngestedMatch, SquadMember } from "../cricket/ingest";
import { buildFeatures, squadAverageCredits, type MatchContext } from "../data/features";
import { scorePlayer, type PlayerScoringInput } from "../scoring/engine";
import { optimizeTeam } from "../scoring/optimizer";
import { validateDream11Team } from "../scoring/validator";
import { getActiveWeights } from "../data/weights";
import { getMatchContext } from "../ai/context";
import { reasonAboutPlayers, ADJUSTMENT_BOUND } from "../ai/reasoning";

export interface AnalysisReasoningMeta {
  used: boolean;
  model: string;
  grounded: boolean;
  captainReason: string;
  viceCaptainReason: string;
  shareableSummary: string;
  contextNote: string;
  error?: string;
}

export interface AnalysisResult {
  match: IngestedMatch;
  mode: RuleMode;
  weightVersion: number;
  context: MatchContext;
  scored: ScoredPlayer[];
  team: SelectedTeam;
  validation: ValidationResult;
  bench: ScoredPlayer[];
  reasoning: AnalysisReasoningMeta;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export interface AnalyzeOptions {
  mode: RuleMode;
  /** Skip the grounding/reasoning Gemini calls (pure deterministic). */
  skipGemini?: boolean;
}

/**
 * Full analysis pipeline for one match. Deterministic scoring + optimization are
 * always run; Gemini context + reasoning enrich it and fall back gracefully.
 */
export async function analyzeMatch(
  match: IngestedMatch,
  squad: SquadMember[],
  opts: AnalyzeOptions,
): Promise<AnalysisResult> {
  // 1. Live context (grounded) — or neutral fallback.
  const context: MatchContext = opts.skipGemini
    ? { format: match.format, pitchType: "unknown", battingFriendliness: 0, avgFirstInningsScore: null, weatherNote: null, summary: "Gemini disabled for this run.", sources: [], grounded: false }
    : await getMatchContext({
        matchId: match.id,
        name: match.name,
        format: match.format,
        venue: match.venue,
        teamA: match.teamA,
        teamB: match.teamB,
        startTime: match.startTime,
      });

  // 2. Deterministic scoring.
  const avgCredits = squadAverageCredits(squad);
  const { version: weightVersion, weights } = await getActiveWeights();

  const scored: ScoredPlayer[] = squad.map((m) => {
    const input: PlayerScoringInput = {
      playerId: m.playerId,
      name: m.name,
      team: m.team,
      teamShort: m.teamShort,
      role: m.role,
      credits: m.credits,
      creditsEstimated: m.creditsEstimated,
      battingOrder: m.battingOrder,
      inAnnouncedXI: m.inAnnouncedXI,
      isImpactSub: m.isImpactSub,
      features: buildFeatures(m, context, avgCredits),
    };
    return scorePlayer(input, weights).player;
  });

  // 3. Gemini reasoning layer (bounded adjustments, risk, reasons, C/VC).
  let reasoningMeta: AnalysisReasoningMeta = {
    used: false,
    model: "",
    grounded: context.grounded,
    captainReason: "",
    viceCaptainReason: "",
    shareableSummary: "",
    contextNote: context.summary,
  };

  if (!opts.skipGemini) {
    const r = await reasonAboutPlayers({
      matchName: match.name,
      format: match.format,
      venue: match.venue,
      context,
      players: scored,
    });
    reasoningMeta.model = r.model;
    reasoningMeta.error = r.error;

    if (r.used && r.reasoning) {
      const byId = new Map(r.reasoning.players.map((p) => [p.player_id, p]));
      for (const sp of scored) {
        const info = byId.get(sp.playerId);
        if (!info) continue;
        const adj = clamp(info.adjustment, -ADJUSTMENT_BOUND, ADJUSTMENT_BOUND);
        sp.geminiAdjustment = Math.round(adj * 100) / 100;
        sp.expectedPoints = Math.max(0, Math.round((sp.baseScore + adj) * 100) / 100);
        sp.reason = info.reason;
        sp.riskFlag = info.risk;
        if (sp.creditsEstimated && typeof info.estimated_credits === "number") {
          sp.credits = clamp(Math.round(info.estimated_credits * 2) / 2, 7.5, 11);
        }
      }
      reasoningMeta = {
        ...reasoningMeta,
        used: true,
        contextNote: r.reasoning.context_note || context.summary,
        shareableSummary: r.reasoning.shareable_summary,
      };
      // stash raw C/VC suggestion for reconciliation below
      (reasoningMeta as unknown as { _cap?: typeof r.reasoning.captain; _vc?: typeof r.reasoning.vice_captain })._cap =
        r.reasoning.captain;
      (reasoningMeta as unknown as { _vc?: typeof r.reasoning.vice_captain })._vc = r.reasoning.vice_captain;
    }
  }

  // 4. Optimize (exact ILP) with the final expected points + credits.
  const { team, infeasibleReason } = optimizeTeam(scored, { mode: opts.mode });
  if (!team) {
    throw new Error(infeasibleReason || "Could not build a valid team");
  }

  // 5. Validate — never surface an invalid team.
  const validation = validateDream11Team(team.players, {
    mode: opts.mode,
    captainId: team.captainId,
    viceCaptainId: team.viceCaptainId,
  });

  // 6. Reconcile C/VC justifications with the optimizer's picks.
  const cap = scored.find((p) => p.playerId === team.captainId);
  const vc = scored.find((p) => p.playerId === team.viceCaptainId);
  const rawCap = (reasoningMeta as unknown as { _cap?: { player_id: string; reason: string } })._cap;
  const rawVc = (reasoningMeta as unknown as { _vc?: { player_id: string; reason: string } })._vc;
  reasoningMeta.captainReason =
    (rawCap && rawCap.player_id === team.captainId ? rawCap.reason : cap?.reason) ||
    `${cap?.name} has the highest projected points in these conditions.`;
  reasoningMeta.viceCaptainReason =
    (rawVc && rawVc.player_id === team.viceCaptainId ? rawVc.reason : vc?.reason) ||
    `${vc?.name} is the next-best projected scorer and a safe multiplier.`;
  // clean internal fields
  delete (reasoningMeta as unknown as { _cap?: unknown })._cap;
  delete (reasoningMeta as unknown as { _vc?: unknown })._vc;

  // 7. Bench = notable players left out (highest expected not selected).
  const selectedIds = new Set(team.players.map((p) => p.playerId));
  const bench = scored
    .filter((p) => !selectedIds.has(p.playerId))
    .sort((a, b) => b.expectedPoints - a.expectedPoints)
    .slice(0, 6);

  return {
    match,
    mode: opts.mode,
    weightVersion,
    context,
    scored,
    team,
    validation,
    bench,
    reasoning: reasoningMeta,
  };
}
