import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureMatchSquad, getMatchRow } from "@/lib/data/matches";
import { analyzeMatch } from "@/lib/pipeline/analyze";
import { getMatchContext } from "@/lib/ai/context";
import { savePrediction, getPredictionForMatch } from "@/lib/data/predictions";

export const ANALYZE_LOCK_MESSAGE =
  "This match already has saved actual points — re-analysing is locked to protect the learning data. Clear the actuals first, or analyse a different match.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  matchId: z.string().uuid(),
  mode: z.enum(["safe", "relaxed"]).default("safe"),
  skipGemini: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    // Lock: never overwrite a saved team that already has actual points.
    const existing = await getPredictionForMatch(parsed.data.matchId);
    if (existing && existing.players.some((p) => p.actualPoints != null)) {
      return NextResponse.json({ error: ANALYZE_LOCK_MESSAGE, locked: true }, { status: 409 });
    }

    // Fetch squad and live context in parallel to stay within the function
    // timeout on cold (never-analysed) matches.
    const matchRow = await getMatchRow(parsed.data.matchId);
    if (!matchRow) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const wantGemini = !parsed.data.skipGemini;
    const [squadRes, context] = await Promise.all([
      ensureMatchSquad(parsed.data.matchId),
      wantGemini
        ? getMatchContext({
            matchId: matchRow.id,
            name: matchRow.name,
            format: matchRow.format,
            venue: matchRow.venue,
            teamA: matchRow.teamA,
            teamB: matchRow.teamB,
            startTime: matchRow.startTime,
          })
        : Promise.resolve(undefined),
    ]);
    const { match, squad, squadsAvailable } = squadRes;
    if (!squadsAvailable) {
      return NextResponse.json(
        { error: "Squads not available for this match yet. Try again closer to the toss." },
        { status: 422 },
      );
    }

    const analysis = await analyzeMatch(match, squad, {
      mode: parsed.data.mode,
      skipGemini: parsed.data.skipGemini,
      context,
    });
    const predictionId = await savePrediction(analysis);
    const saved = await getPredictionForMatch(parsed.data.matchId);

    return NextResponse.json({
      predictionId,
      prediction: saved,
      validation: analysis.validation,
      context: {
        summary: analysis.context.summary,
        pitchType: analysis.context.pitchType,
        avgFirstInningsScore: analysis.context.avgFirstInningsScore,
        weatherNote: analysis.context.weatherNote,
        sources: analysis.context.sources,
        grounded: analysis.context.grounded,
      },
      reasoning: analysis.reasoning,
      bench: analysis.bench,
      team: {
        teamSplit: analysis.team.teamSplit,
        totalCredits: analysis.team.totalCredits,
        totalExpectedPoints: analysis.team.totalExpectedPoints,
        totalEffectivePoints: analysis.team.totalEffectivePoints,
        roleCounts: analysis.team.roleCounts,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
