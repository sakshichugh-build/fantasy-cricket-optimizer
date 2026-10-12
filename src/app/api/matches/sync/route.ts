import { NextResponse } from "next/server";
import { syncMatches } from "@/lib/data/matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const result = await syncMatches();
  const status = result.error ? 502 : 200;
  return NextResponse.json(result, { status });
}
