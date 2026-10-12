import { getInsightsDashboard, type InsightsDashboard as Dash } from "@/lib/insights/metrics";
import { InsightsDashboard } from "@/components/insights/InsightsDashboard";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  let data: Dash | null = null;
  let error: string | null = null;
  try {
    data = await getInsightsDashboard();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load insights";
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-bold sm:text-2xl">Insights &amp; self-improvement</h1>
        <p className="text-sm text-muted">
          Predicted vs actual over time, where the model is biased, and weight suggestions it can learn
          from.
        </p>
      </div>
      {error ? (
        <div className="card border-[var(--danger)] p-4 text-sm text-muted">{error}</div>
      ) : (
        <InsightsDashboard data={data!} />
      )}
    </div>
  );
}
