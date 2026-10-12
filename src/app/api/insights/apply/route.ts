import { NextResponse } from "next/server";
import { z } from "zod";
import { applyInsight, dismissInsight } from "@/lib/insights/apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  insightId: z.string().uuid(),
  action: z.enum(["apply", "dismiss"]).default("apply"),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  try {
    if (parsed.data.action === "dismiss") {
      await dismissInsight(parsed.data.insightId);
      return NextResponse.json({ ok: true, action: "dismiss" });
    }
    const result = await applyInsight(parsed.data.insightId);
    return NextResponse.json({ ok: true, action: "apply", ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Action failed" }, { status: 500 });
  }
}
