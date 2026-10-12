import "server-only";
import { getServiceClient } from "../supabase/server";

/**
 * TTL cache backed by the Supabase `api_cache` table. Protects the free cricket
 * API quota and avoids repeated Gemini calls. Cache misses and DB errors fail
 * open (return null) so a cache problem never breaks a request.
 */

export async function getCached<T>(
  key: string,
  opts: { allowStale?: boolean } = {},
): Promise<T | null> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("api_cache")
      .select("payload, expires_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    if (!opts.allowStale && new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.payload as T;
  } catch {
    return null;
  }
}

export async function setCached(
  key: string,
  source: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const supabase = getServiceClient();
    const expires_at = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await supabase
      .from("api_cache")
      .upsert(
        { cache_key: key, source, payload: payload as never, expires_at },
        { onConflict: "cache_key" },
      );
  } catch {
    // ignore cache write failures
  }
}

/** Fetch-through cache: return cached value if fresh, else run fetcher and store. */
export async function withCache<T>(
  key: string,
  source: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; cached: boolean }> {
  const hit = await getCached<T>(key);
  if (hit !== null) return { data: hit, cached: true };
  const data = await fetcher();
  await setCached(key, source, data, ttlSeconds);
  return { data, cached: false };
}
