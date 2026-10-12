import "server-only";
import { z } from "zod";
import { generateStructured } from "./gemini";
import { withCache } from "../data/cache";
import type { CricSquadTeam } from "../cricket/types";

/**
 * AI-estimated squad fallback. When the cricket API squad endpoint returns
 * nothing (free tier no longer includes the Fantasy Squad API, and quota is
 * finite), we ask Gemini for each team's most likely XI as structured JSON.
 * The brief explicitly allows filling a missing playing-XI with Gemini; the UI
 * labels these squads as AI-estimated.
 */

const squadSchema = z.object({
  teams: z
    .array(
      z.object({
        name: z.string(),
        players: z.array(
          z.object({
            name: z.string(),
            role: z.enum(["WK", "BAT", "AR", "BOWL"]),
            battingOrder: z.number(),
          }),
        ),
      }),
    )
    .min(2),
});

const responseSchema = {
  type: "object",
  properties: {
    teams: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          players: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string", enum: ["WK", "BAT", "AR", "BOWL"] },
                battingOrder: { type: "number" },
              },
              required: ["name", "role", "battingOrder"],
            },
          },
        },
        required: ["name", "players"],
      },
    },
  },
  required: ["teams"],
};

const ROLE_WORD: Record<"WK" | "BAT" | "AR" | "BOWL", string> = {
  WK: "WK-Batsman",
  BAT: "Batsman",
  AR: "Allrounder",
  BOWL: "Bowler",
};

export interface GeminiSquadInput {
  matchId: string;
  name: string;
  format: string;
  teamA: string | null;
  teamB: string | null;
}

export async function fetchGeminiSquad(input: GeminiSquadInput): Promise<CricSquadTeam[]> {
  const cacheKey = `sq:ai:${input.matchId}`;
  try {
    const { data } = await withCache<CricSquadTeam[]>(cacheKey, "gemini", 86400, async () => {
      const result = await generateStructured({
        contents: `For the cricket match "${input.name}" (${input.format}) between ${input.teamA ?? "Team A"} and ${input.teamB ?? "Team B"}, give each team's most likely playing XI. Exactly 11 players per team, each with a Dream11 role (WK, BAT, AR, BOWL) and batting order 1-11. Each team needs at least 1 WK, 3+ BAT, 1+ AR and 3+ BOWL so the XI is balanced. Use real player names where known; otherwise plausible names for these teams.`,
        system:
          "You are a cricket squad expert. Return realistic, balanced XIs valid for fantasy cricket.",
        responseSchema,
        validator: squadSchema,
        temperature: 0.5,
        timeoutMs: 30000,
        retries: 2,
      });

      return result.teams.map((t) => ({
        teamName: t.name,
        shortname: t.name.slice(0, 3).toUpperCase(),
        players: [...t.players]
          .sort((a, b) => a.battingOrder - b.battingOrder)
          .map((p) => ({
            name: p.name,
            role: ROLE_WORD[p.role],
            bowlingStyle: p.role === "BOWL" || p.role === "AR" ? "Right-arm" : undefined,
          })),
      }));
    });
    return data;
  } catch {
    return [];
  }
}
