import "server-only";
import { z } from "zod";
import { getCached, setCached } from "../data/cache";
import {
  cricMatchSchema,
  cricSquadTeamSchema,
  envelopeSchema,
  type CricMatch,
  type CricSquadTeam,
} from "./types";

const BASE = process.env.CRICKET_API_BASE || "https://api.cricapi.com/v1";

export class CricketApiError extends Error {
  quota: boolean;
  status: number;
  constructor(message: string, opts: { quota?: boolean; status?: number } = {}) {
    super(message);
    this.name = "CricketApiError";
    this.quota = opts.quota ?? false;
    this.status = opts.status ?? 0;
  }
}

function apiKey(): string {
  const k = process.env.CRICKET_API_KEY;
  if (!k) throw new CricketApiError("CRICKET_API_KEY is not set", { status: 500 });
  return k;
}

export interface CricInfo {
  hitsToday?: number;
  hitsLimit?: number;
  credits?: number;
}

export interface CricResult<T> {
  data: T;
  info?: CricInfo;
  cached: boolean;
  stale: boolean;
}

/** Low-level cached fetch against a CricAPI endpoint. */
async function cricFetch<T>(
  path: string,
  params: Record<string, string>,
  dataSchema: z.ZodType<T>,
  ttlSeconds: number,
): Promise<CricResult<T>> {
  const cacheKey = `cric:${path}:${JSON.stringify(params)}`;

  const fresh = await getCached<{ data: T; info?: CricInfo }>(cacheKey);
  if (fresh) return { data: fresh.data, info: fresh.info, cached: true, stale: false };

  try {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set("apikey", apiKey());
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new CricketApiError(`Cricket API HTTP ${res.status}`, {
        status: res.status,
        quota: res.status === 429,
      });
    }

    const json = await res.json();
    const envelope = envelopeSchema(dataSchema).safeParse(json);
    if (!envelope.success) {
      throw new CricketApiError(`Cricket API schema error: ${envelope.error.message}`, { status: 422 });
    }
    const body = envelope.data;
    if (body.status !== "success") {
      const reason = body.reason || "request failed";
      const quota = /limit|exhaust|quota|upgrade|hits/i.test(reason);
      throw new CricketApiError(`Cricket API: ${reason}`, { quota, status: quota ? 429 : 400 });
    }

    const info = body.info as CricInfo | undefined;
    const data = body.data as T;
    await setCached(cacheKey, "cricket", { data, info }, ttlSeconds);
    return { data, info, cached: false, stale: false };
  } catch (err) {
    // Fall back to stale cache on any failure (quota protection / resilience).
    const stale = await getCached<{ data: T; info?: CricInfo }>(cacheKey, { allowStale: true });
    if (stale) return { data: stale.data, info: stale.info, cached: true, stale: true };
    if (err instanceof CricketApiError) throw err;
    throw new CricketApiError(err instanceof Error ? err.message : String(err));
  }
}

/** Current & recent matches (fantasy-relevant). TTL 10 min. */
export function getCurrentMatches(offset = 0): Promise<CricResult<CricMatch[]>> {
  return cricFetch("currentMatches", { offset: String(offset) }, z.array(cricMatchSchema), 600);
}

/** Broader matches list (series fixtures). TTL 10 min. */
export function getMatchesList(offset = 0): Promise<CricResult<CricMatch[]>> {
  return cricFetch("matches", { offset: String(offset) }, z.array(cricMatchSchema), 600);
}

/** Full match info for one match. TTL 5 min. */
export function getMatchInfo(id: string): Promise<CricResult<CricMatch>> {
  return cricFetch("match_info", { id }, cricMatchSchema, 300);
}

/** Announced squads / probable XI for a match. TTL 20 min. */
export function getMatchSquad(id: string): Promise<CricResult<CricSquadTeam[]>> {
  return cricFetch("match_squad", { id }, z.array(cricSquadTeamSchema), 1200);
}

/** Lightweight connectivity/quota probe used by the health check + seed scripts. */
export async function pingCricketApi(): Promise<{ ok: boolean; info?: CricInfo; message: string }> {
  try {
    const r = await getCurrentMatches(0);
    return {
      ok: true,
      info: r.info,
      message: r.cached ? "ok (cached)" : "ok (live)",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
