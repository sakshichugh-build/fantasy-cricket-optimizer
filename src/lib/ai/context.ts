import "server-only";
import { z } from "zod";
import { generateGrounded, generateStructured } from "./gemini";
import { withCache } from "../data/cache";
import { NEUTRAL_CONTEXT, type MatchContext, type PitchType } from "../data/features";
import type { MatchFormat } from "../types";

/** Structured (non-grounded) context estimate, used when Google Search grounding
 * is unavailable (quota/entitlement). Clearly labelled as an AI estimate. */
const structuredContextSchema = z.object({
  pitchType: z.enum(["spin", "pace", "batting", "bowling", "balanced"]),
  battingFriendliness: z.number().min(-1).max(1),
  avgFirstInningsScore: z.number().nullable(),
  weatherNote: z.string().nullable(),
  summary: z.string(),
});

const structuredContextResponse = {
  type: "object",
  properties: {
    pitchType: { type: "string", enum: ["spin", "pace", "batting", "bowling", "balanced"] },
    battingFriendliness: { type: "number" },
    avgFirstInningsScore: { type: "number" },
    weatherNote: { type: "string" },
    summary: { type: "string" },
  },
  required: ["pitchType", "battingFriendliness", "summary"],
};

async function getStructuredContext(input: ContextInput): Promise<MatchContext> {
  const data = await generateStructured({
    contents: `Give a concise conditions briefing for the cricket match "${input.name}" (${input.format}) at ${input.venue ?? "the venue"}. Based on the venue and format, estimate: pitchType (spin/pace/batting/bowling/balanced), battingFriendliness (-1 bowler-friendly .. +1 flat batting track), a typical first-innings par score, likely weather, and a 2-3 sentence summary of how it should play and what it means for selection.`,
    system: "You are a cricket pitch and conditions analyst. Give a realistic, venue-aware estimate.",
    responseSchema: structuredContextResponse,
    validator: structuredContextSchema,
    temperature: 0.4,
    timeoutMs: 11000,
    retries: 0,
  });
  return {
    format: input.format,
    pitchType: data.pitchType,
    battingFriendliness: data.battingFriendliness,
    avgFirstInningsScore: data.avgFirstInningsScore ?? null,
    weatherNote: data.weatherNote ?? null,
    summary: `${data.summary} (AI estimate — not live-grounded.)`,
    sources: [],
    grounded: false,
  };
}

export interface ContextInput {
  matchId: string;
  name: string;
  format: MatchFormat;
  venue: string | null;
  teamA: string | null;
  teamB: string | null;
  startTime: string | null;
}

/** Heuristic extraction of structured pitch context from a grounded text report. */
export function parseContextFromText(text: string, format: MatchFormat): Omit<MatchContext, "summary" | "sources" | "grounded" | "format"> {
  const t = text.toLowerCase();
  let pitchType: PitchType = "balanced";
  if (/turn|turner|spin-friendly|spin friendly|assist(s|ing)? spin|rank turner|dry (pitch|surface)/.test(t)) {
    pitchType = "spin";
  } else if (/seam|swing|pace-friendly|pace friendly|green (pitch|top)|bouncy|hard (and )?fast/.test(t)) {
    pitchType = "pace";
  } else if (/flat|belter|road|batting paradise|high[- ]scoring|true surface|good (for )?bat/.test(t)) {
    pitchType = "batting";
  } else if (/low[- ]scoring|bowler-friendly|bowler friendly|tough (for )?bat|sluggish/.test(t)) {
    pitchType = "bowling";
  }

  let battingFriendliness = 0;
  if (pitchType === "batting") battingFriendliness = 0.6;
  else if (pitchType === "bowling") battingFriendliness = -0.5;
  else if (pitchType === "spin") battingFriendliness = -0.15;
  else if (pitchType === "pace") battingFriendliness = -0.2;

  // average first-innings / par score
  let avgFirstInningsScore: number | null = null;
  const scoreMatch = t.match(/(?:average|par|first[- ]innings|1st[- ]innings)[^\d]{0,30}(\d{2,3})/);
  if (scoreMatch) {
    const n = Number(scoreMatch[1]);
    if (n >= 60 && n <= 500) avgFirstInningsScore = n;
  }

  let weatherNote: string | null = null;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const w = sentences.find((s) => /rain|weather|overcast|clear|cloud|dew|humid|wind/i.test(s));
  if (w) weatherNote = w.trim().slice(0, 200);

  return { pitchType, battingFriendliness, avgFirstInningsScore, weatherNote };
}

/**
 * Fetch grounded live context for a match (pitch, conditions, toss, XI/injury
 * news) via Gemini + Google Search. Cached 1h. Falls back to NEUTRAL_CONTEXT
 * when grounding fails (e.g. quota), so analysis can always proceed.
 */
export async function getMatchContext(input: ContextInput): Promise<MatchContext> {
  const cacheKey = `ctx:${input.matchId}`;
  try {
    const { data } = await withCache<MatchContext>(cacheKey, "gemini", 3600, async () => {
      const when = input.startTime ? new Date(input.startTime).toUTCString() : "the upcoming date";
      const prompt = `You are a cricket analyst. For the match "${input.name}" (${input.format}) at ${input.venue ?? "the venue"}, starting around ${when}, give a concise live briefing covering:
- the pitch report and how it is expected to play (spin-friendly, pace/seam-friendly, flat/batting, or low-scoring)
- the average/par first-innings score at this venue for this format
- weather and dew
- toss tendencies (bat/bowl first) and any team news / injuries / likely XI changes
Keep it factual and under 180 words.`;

      // 1. Prefer Google Search grounded context.
      try {
        const grounded = await generateGrounded(prompt, {
          system: "You summarise real, current cricket conditions. Be specific to this venue and match.",
          timeoutMs: 14000,
          retries: 0,
        });
        if (grounded.text && grounded.text.trim()) {
          const parsed = parseContextFromText(grounded.text, input.format);
          return {
            format: input.format,
            ...parsed,
            summary: grounded.text.trim(),
            sources: grounded.sources.slice(0, 6),
            grounded: true,
          } satisfies MatchContext;
        }
      } catch {
        /* grounding unavailable — fall through to structured estimate */
      }

      // 2. Structured (non-grounded) estimate, so the UI isn't left with "Unknown".
      return await getStructuredContext(input);
    });
    return data;
  } catch {
    return { ...NEUTRAL_CONTEXT, format: input.format };
  }
}
