import { notFound } from "next/navigation";
import { getMatchDetail } from "@/lib/data/matches";
import { getPredictionForMatch } from "@/lib/data/predictions";
import { MatchAnalysis } from "@/components/match/MatchAnalysis";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatchDetail(id);
  if (!match) notFound();
  const prediction = await getPredictionForMatch(id);

  return <MatchAnalysis match={match} initialPrediction={prediction} />;
}
