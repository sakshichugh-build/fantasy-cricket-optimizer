import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMatchDetail } from "@/lib/data/matches";
import { getPredictionForMatch } from "@/lib/data/predictions";
import { ActualsForm } from "@/components/match/ActualsForm";

export const dynamic = "force-dynamic";

export default async function ActualsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatchDetail(id);
  if (!match) notFound();
  const prediction = await getPredictionForMatch(id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/match/${id}`} className="chip w-fit hover:!text-[var(--accent)]">
          <ArrowLeft size={13} /> Back to team
        </Link>
        <h1 className="mt-2 font-display text-xl font-bold sm:text-2xl">Enter actual Dream11 points</h1>
        <p className="text-sm text-muted">{match.name}</p>
      </div>

      {!prediction ? (
        <div className="card p-6 text-sm text-muted">
          No saved team for this match yet.{" "}
          <Link href={`/match/${id}`} className="text-accent">
            Analyse it first
          </Link>
          , then come back to log actual points.
        </div>
      ) : (
        <ActualsForm prediction={prediction} matchId={id} />
      )}
    </div>
  );
}
