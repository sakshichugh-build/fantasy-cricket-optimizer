import { NextResponse } from "next/server";
import { computeAndStoreInsights } from "@/lib/insights/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST() {
  try {
    const result = await computeAndStoreInsights();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Compute failed" }, { status: 500 });
  }
}
