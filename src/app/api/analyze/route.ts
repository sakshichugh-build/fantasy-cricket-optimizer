import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureMatchSquad } from "@/lib/data/matches";
import { analyzeMatch } from "@/lib/pipeline/analyze";
import { savePrediction, getPredictionForMatch } from "@/lib/data/predictions";

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
    const { match, squad, squadsAvailable } = await ensureMatchSquad(parsed.data.matchId);
    if (!squadsAvailable) {
      return NextResponse.json(
        { error: "Squads not announced yet for this match. Try again closer to the toss." },
        { status: 422 },
      );
    }

    const analysis = await analyzeMatch(match, squad, {
      mode: parsed.data.mode,
      skipGemini: parsed.data.skipGemini,
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
