import { ComponentsMap } from "@/components/ComponentsMap";

export const metadata = {
  title: "Components Map · Match Day Optimizer",
};

export default function ComponentsMapPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-bold sm:text-2xl">Components Map</h1>
        <p className="text-sm text-muted">
          Actor swimlanes across the pipeline stages, with the post-match learning loop feeding back
          into Supabase memory.
        </p>
      </div>
      <ComponentsMap />
    </div>
  );
}
