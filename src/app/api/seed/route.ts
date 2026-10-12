import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const url = new URL(req.url);
  const count = Number(url.searchParams.get("count") ?? "6");
  try {
    const result = await seedDatabase({ count: Number.isFinite(count) ? count : 6 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 },
    );
  }
}
