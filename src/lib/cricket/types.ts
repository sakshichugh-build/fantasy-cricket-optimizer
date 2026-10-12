import { z } from "zod";
import type { Dream11Role, MatchFormat } from "../types";

/**
 * Loose zod schemas for CricketData.org (CricAPI) responses. The API returns
 * many optional/variable fields, so these validate the envelope and the fields
 * we rely on while passing through the rest.
 */

export const cricApiInfoSchema = z
  .object({
    hitsToday: z.number().optional(),
    hitsUsed: z.number().optional(),
    hitsLimit: z.number().optional(),
    credits: z.number().optional(),
    totalRows: z.number().optional(),
  })
  .passthrough();

export function envelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z
    .object({
      apikey: z.string().optional(),
      data: dataSchema.optional(),
      status: z.string(),
      info: cricApiInfoSchema.optional(),
      reason: z.string().optional(),
    })
    .passthrough();
}

export const teamInfoSchema = z
  .object({
    name: z.string().optional(),
    shortname: z.string().optional(),
    img: z.string().optional(),
  })
  .passthrough();

export const matchScoreSchema = z
  .object({
    r: z.number().optional(),
    w: z.number().optional(),
    o: z.number().optional(),
    inning: z.string().optional(),
  })
  .passthrough();

export const cricMatchSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    matchType: z.string().optional(),
    status: z.string().optional(),
    venue: z.string().optional(),
    date: z.string().optional(),
    dateTimeGMT: z.string().optional(),
    teams: z.array(z.string()).optional(),
    teamInfo: z.array(teamInfoSchema).optional(),
    score: z.array(matchScoreSchema).optional(),
    series_id: z.string().optional(),
    fantasyEnabled: z.boolean().optional(),
    hasSquad: z.boolean().optional(),
    matchStarted: z.boolean().optional(),
    matchEnded: z.boolean().optional(),
    tossWinner: z.string().optional(),
    tossChoice: z.string().optional(),
    matchWinner: z.string().optional(),
  })
  .passthrough();

export type CricMatch = z.infer<typeof cricMatchSchema>;

export const cricSquadPlayerSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    role: z.string().optional(),
    battingStyle: z.string().optional(),
    bowlingStyle: z.string().optional(),
    country: z.string().optional(),
    playerImg: z.string().optional(),
  })
  .passthrough();

export const cricSquadTeamSchema = z
  .object({
    teamName: z.string().optional(),
    shortname: z.string().optional(),
    img: z.string().optional(),
    players: z.array(cricSquadPlayerSchema).default([]),
  })
  .passthrough();

export type CricSquadTeam = z.infer<typeof cricSquadTeamSchema>;

/** Map a CricAPI match type to our canonical format. */
export function mapFormat(matchType?: string): MatchFormat {
  const t = (matchType || "").toLowerCase();
  if (t.includes("test")) return "TEST";
  if (t.includes("odi")) return "ODI";
  if (t.includes("t10")) return "T10";
  return "T20";
}

/** Map a CricAPI status string to our canonical status. */
export function mapStatus(m: {
  status?: string;
  matchStarted?: boolean;
  matchEnded?: boolean;
}): "upcoming" | "live" | "completed" {
  if (m.matchEnded) return "completed";
  if (m.matchStarted) return "live";
  const s = (m.status || "").toLowerCase();
  if (m.matchEnded === undefined && /won by|draw|abandon|no result|tie/.test(s)) return "completed";
  if (/live|innings break|stumps|rain|delay/.test(s) && m.matchStarted) return "live";
  return "upcoming";
}

/**
 * Map a CricAPI role string (+ styles) to a Dream11 role tag. These are best
 * guesses and the UI lets Aryan override per player.
 */
export function mapRole(role?: string, bowlingStyle?: string): Dream11Role {
  const r = (role || "").toLowerCase();
  if (/wk|keeper|wicket/.test(r)) return "WK";
  if (/all ?-? ?rounder|allrounder/.test(r)) return "AR";
  if (/bowl/.test(r)) return "BOWL";
  if (/bat/.test(r)) return "BAT";
  // fall back to bowling style presence
  if (bowlingStyle && bowlingStyle.trim() && !/none|n\/a/i.test(bowlingStyle)) return "BOWL";
  return "BAT";
}
