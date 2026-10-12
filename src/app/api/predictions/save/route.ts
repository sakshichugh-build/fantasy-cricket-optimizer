import { NextResponse } from "next/server";
import { z } from "zod";
import { resaveTeam, getPredictionById } from "@/lib/data/predictions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  predictionId: z.string().uuid(),
  selectedIds: z.array(z.string()).length(11),
  captainId: z.string(),
  viceCaptainId: z.string(),
  mode: z.enum(["safe", "relaxed"]).default("safe"),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  try {
    const validation = await resaveTeam(parsed.data.predictionId, parsed.data);
    if (!validation.valid) {
      return NextResponse.json({ error: "Invalid team", validation }, { status: 422 });
    }
    const prediction = await getPredictionById(parsed.data.predictionId);
    return NextResponse.json({ validation, prediction });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 500 });
  }
}
