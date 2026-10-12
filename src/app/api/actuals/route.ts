import { NextResponse } from "next/server";
import { z } from "zod";
import { saveActuals, getPredictionById } from "@/lib/data/predictions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  predictionId: z.string().uuid(),
  entries: z
    .array(z.object({ playerId: z.string(), playerName: z.string(), points: z.number() }))
    .min(1),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  try {
    await saveActuals(parsed.data.predictionId, parsed.data.entries);
    const prediction = await getPredictionById(parsed.data.predictionId);
    return NextResponse.json({ ok: true, prediction });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 500 });
  }
}
