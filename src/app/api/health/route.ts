import { NextResponse } from "next/server";
import { pingCricketApi } from "@/lib/cricket/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    cricket: Boolean(process.env.CRICKET_API_KEY),
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  };
  let cricket: Awaited<ReturnType<typeof pingCricketApi>> = { ok: false, message: "not configured" };
  if (env.cricket) {
    try {
      cricket = await pingCricketApi();
    } catch (e) {
      cricket = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ env, cricket });
}
