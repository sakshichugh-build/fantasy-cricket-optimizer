import { NextResponse } from "next/server";
import { z } from "zod";
import { rollbackToVersion } from "@/lib/insights/apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ version: z.number().int().positive() });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  try {
    await rollbackToVersion(parsed.data.version);
    return NextResponse.json({ ok: true, activeVersion: parsed.data.version });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Rollback failed" }, { status: 500 });
  }
}
