import "server-only";
import { z } from "zod";
import { generateStructured, GEMINI_MODEL } from "./gemini";
import type { ScoredPlayer } from "../types";
import type { MatchContext } from "../data/features";

/** Gemini may nudge a player's deterministic score by at most this many points. */
export const ADJUSTMENT_BOUND = 12;

export interface ReasoningInput {
  matchName: string;
  format: string;
  venue: string | null;
  context: MatchContext;
  players: ScoredPlayer[];
}

const reasoningSchema = z.object({
  context_note: z.string(),
  players: z.array(
    z.object({
      player_id: z.string(),
      reason: z.string(),
      risk: z.enum(["low", "medium", "high"]),
      adjustment: z.number(),
      estimated_credits: z.number().nullable().optional(),
      likely_xi: z.boolean().nullable().optional(),
    }),
  ),
  captain: z.object({ player_id: z.string(), reason: z.string() }),
  vice_captain: z.object({ player_id: z.string(), reason: z.string() }),
  shareable_summary: z.string(),
});

export type GeminiReasoning = z.infer<typeof reasoningSchema>;

const responseSchema = {
  type: "object",
  properties: {
    context_note: { type: "string" },
    players: {
      type: "array",
      items: {
        type: "object",
        properties: {
          player_id: { type: "string" },
          reason: { type: "string" },
          risk: { type: "string", enum: ["low", "medium", "high"] },
          adjustment: { type: "number" },
          estimated_credits: { type: "number" },
          likely_xi: { type: "boolean" },
        },
        required: ["player_id", "reason", "risk", "adjustment"],
      },
    },
    captain: {
      type: "object",
      properties: { player_id: { type: "string" }, reason: { type: "string" } },
      required: ["player_id", "reason"],
    },
    vice_captain: {
      type: "object",
      properties: { player_id: { type: "string" }, reason: { type: "string" } },
      required: ["player_id", "reason"],
    },
    shareable_summary: { type: "string" },
  },
  required: ["context_note", "players", "captain", "vice_captain", "shareable_summary"],
};

export interface ReasoningResult {
  reasoning: GeminiReasoning | null;
  used: boolean;
  model: string;
  error?: string;
}

/**
 * Ask Gemini Flash for match-specific per-player reasoning, risk flags, bounded
 * score adjustments, and C/VC picks with confident justifications. Returns
 * `used: false` with no reasoning if Gemini fails (caller proceeds with the pure
 * deterministic scores).
 */
export async function reasonAboutPlayers(input: ReasoningInput): Promise<ReasoningResult> {
  const playerLines = input.players
    .map(
      (p) =>
        `- id=${p.playerId} | ${p.name} (${p.team}) | role=${p.role} | battingOrder=${p.battingOrder ?? "?"} | announcedXI=${p.inAnnouncedXI} | credits=${p.credits} | modelScore=${p.baseScore}`,
    )
    .join("\n");

  const system = `You are a Dream11 fantasy cricket expert advising a serious player.
Rules:
- Give reasoning SPECIFIC to THIS match, venue and conditions. Never generic "he is in form" lines.
- You may adjust each player's model score by at most +/-${ADJUSTMENT_BOUND} points, and must justify any non-zero adjustment in the reason.
- Captain and Vice-Captain must be two DIFFERENT players, chosen from those most likely to score heavily in these exact conditions, with a confident one- or two-sentence justification a user could repeat to their league group.
- Echo each player's id exactly. Only reference players from the provided list.`;

  const contents = `Match: ${input.matchName} (${input.format}) at ${input.venue ?? "unknown venue"}

Live context:
${input.context.summary}
Pitch read: ${input.context.pitchType}; batting friendliness ${input.context.battingFriendliness}; avg 1st-innings ${input.context.avgFirstInningsScore ?? "n/a"}.

Players (model scores already include role, availability, batting position and pitch fit):
${playerLines}

For every player return: a match-specific reason, a risk flag (low/medium/high), a bounded adjustment (${-ADJUSTMENT_BOUND}..${ADJUSTMENT_BOUND}), an estimated Dream11 credit value (7.5-11), and whether they are likely in the XI. Then pick Captain and Vice-Captain (different players) with confident justifications, and a short shareable summary for a league group.`;

  try {
    const reasoning = await generateStructured({
      contents,
      system,
      responseSchema,
      validator: reasoningSchema,
      temperature: 0.45,
      timeoutMs: 40000,
    });
    return { reasoning, used: true, model: GEMINI_MODEL };
  } catch (err) {
    return {
      reasoning: null,
      used: false,
      model: GEMINI_MODEL,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
