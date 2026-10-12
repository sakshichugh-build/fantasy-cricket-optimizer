import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";

/**
 * Gemini Flash client. All AI in this app goes through here. Every call has:
 * a timeout, retry-with-backoff on 429/5xx, and the caller is expected to fall
 * back to the deterministic model if this throws.
 */

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client = new GoogleGenAI({ apiKey });
  return client;
}

export class GeminiError extends Error {
  status?: number;
  quota: boolean;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.quota = status === 429;
  }
}

function parseStatus(err: unknown): number | undefined {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/"code"\s*:\s*(\d{3})/) || msg.match(/\b(429|500|503|504|400|404)\b/);
  return m ? Number(m[1]) : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new GeminiError(`${label} timed out after ${ms}ms`, 504)), ms),
    ),
  ]);
}

interface RetryOpts {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  label?: string;
}

async function callWithRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 800, timeoutMs = 30000, label = "gemini" } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, label);
    } catch (err) {
      lastErr = err;
      const status = parseStatus(err);
      const retryable = status === 429 || status === 500 || status === 503 || status === 504 || status === undefined;
      if (attempt === retries || !retryable) {
        throw new GeminiError(err instanceof Error ? err.message : String(err), status);
      }
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 300;
      await sleep(delay);
    }
  }
  throw new GeminiError(lastErr instanceof Error ? lastErr.message : String(lastErr), parseStatus(lastErr));
}

export interface StructuredOptions<T> {
  /** Prompt contents (string or parts). */
  contents: string;
  /** System instruction steering the model. */
  system?: string;
  /** JSON schema object passed to the API for constrained decoding. */
  responseSchema: Record<string, unknown>;
  /** Zod schema that validates (and types) the parsed JSON. */
  validator: z.ZodType<T>;
  temperature?: number;
  timeoutMs?: number;
  retries?: number;
}

/**
 * Structured JSON generation. Returns a zod-validated object. Throws GeminiError
 * on failure (caller falls back to the deterministic model).
 */
export async function generateStructured<T>(opts: StructuredOptions<T>): Promise<T> {
  const ai = getClient();
  const run = () =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: opts.contents,
      config: {
        ...(opts.system ? { systemInstruction: opts.system } : {}),
        responseMimeType: "application/json",
        responseSchema: opts.responseSchema as never,
        temperature: opts.temperature ?? 0.4,
      },
    });

  const res = await callWithRetry(run, {
    timeoutMs: opts.timeoutMs ?? 30000,
    retries: opts.retries ?? 3,
    label: "gemini.structured",
  });

  const text = res.text;
  if (!text) throw new GeminiError("Empty response from Gemini", 500);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Occasionally the model wraps JSON in prose/fences; salvage the JSON body.
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new GeminiError("Gemini did not return JSON", 500);
    parsed = JSON.parse(match[0]);
  }

  const result = opts.validator.safeParse(parsed);
  if (!result.success) {
    throw new GeminiError(`Gemini JSON failed validation: ${result.error.message}`, 422);
  }
  return result.data;
}

export interface GroundedResult {
  text: string;
  queries: string[];
  sources: { title?: string; uri?: string }[];
}

/**
 * Google Search grounded generation for live match context (pitch, weather,
 * toss, XI news). Returns text plus the grounding metadata. Cannot be combined
 * with responseSchema, so this returns free text to be parsed/summarised.
 */
export async function generateGrounded(
  contents: string,
  opts: { system?: string; timeoutMs?: number; retries?: number } = {},
): Promise<GroundedResult> {
  const ai = getClient();
  const run = () =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        ...(opts.system ? { systemInstruction: opts.system } : {}),
        tools: [{ googleSearch: {} }],
        temperature: 0.3,
      },
    });

  const res = await callWithRetry(run, {
    timeoutMs: opts.timeoutMs ?? 35000,
    retries: opts.retries ?? 2,
    label: "gemini.grounded",
  });

  const gm = res.candidates?.[0]?.groundingMetadata;
  const sources =
    gm?.groundingChunks?.map((c) => ({
      title: c.web?.title,
      uri: c.web?.uri,
    })) ?? [];

  return {
    text: res.text ?? "",
    queries: gm?.webSearchQueries ?? [],
    sources,
  };
}
