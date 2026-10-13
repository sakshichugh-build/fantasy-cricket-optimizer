import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureMatchSquad } from "@/lib/data/matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const bodySchema = z.object({ matchId: z.string().uuid() });

/**
 * Warm the squad for a match (cricket API or Gemini fallback) so a subsequent
 * /api/analyze only has to do context + reasoning and comfortably fits the
 * function timeout. Safe to call repeatedly — ensureMatchSquad is idempotent.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  try {
    const { squadsAvailable } = await ensureMatchSquad(parsed.data.matchId);
    return NextResponse.json({ ok: true, squadsAvailable });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "prep failed" }, { status: 500 });
  }
}
