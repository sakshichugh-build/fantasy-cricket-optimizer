import "server-only";
import { getServiceClient } from "../supabase/server";
import type { Dream11Role, MatchFormat } from "../types";
import {
  mapFormat,
  mapRole,
  mapStatus,
  type CricMatch,
  type CricSquadTeam,
} from "./types";

export interface IngestedMatch {
  id: string;
  externalId: string | null;
  name: string;
  format: MatchFormat;
  status: "upcoming" | "live" | "completed";
  venue: string | null;
  teamA: string | null;
  teamB: string | null;
  startTime: string | null;
  hasSquads: boolean;
}

export interface SquadMember {
  matchPlayerId: string;
  playerId: string;
  name: string;
  team: string;
  teamShort: string | null;
  role: Dream11Role;
  credits: number;
  creditsEstimated: boolean;
  inAnnouncedXI: boolean;
  isImpactSub: boolean;
  battingOrder: number | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
}

function splitVenue(venue?: string): { venue: string | null; city: string | null } {
  if (!venue) return { venue: null, city: null };
  const parts = venue.split(",").map((s) => s.trim());
  if (parts.length >= 2) return { venue: parts.slice(0, -1).join(", "), city: parts[parts.length - 1] };
  return { venue, city: null };
}

/** Baseline credit estimate when no authoritative source exists. Documented in README. */
export function estimateCredits(role: Dream11Role, inAnnouncedXI: boolean): number {
  const base: Record<Dream11Role, number> = { WK: 8.5, BAT: 8.5, AR: 9.0, BOWL: 8.0 };
  const c = base[role] + (inAnnouncedXI ? 0.5 : 0);
  return Math.min(11, Math.max(7.5, Math.round(c * 2) / 2));
}

/** Upsert a CricAPI match into the `matches` table, returning our canonical row. */
export async function upsertMatch(m: CricMatch): Promise<IngestedMatch> {
  const supabase = getServiceClient();
  const { venue, city } = splitVenue(m.venue);
  const format = mapFormat(m.matchType);
  const status = mapStatus(m);
  const teams = m.teams ?? [];
  const teamInfo = m.teamInfo ?? [];
  const infoFor = (name?: string) => teamInfo.find((t) => t.name === name);

  const row = {
    external_id: m.id,
    name: m.name ?? `${teams[0] ?? "TBD"} vs ${teams[1] ?? "TBD"}`,
    short_name: m.name ?? null,
    format,
    status,
    venue,
    venue_city: city,
    team_a: teams[0] ?? null,
    team_a_short: infoFor(teams[0])?.shortname ?? null,
    team_a_logo: infoFor(teams[0])?.img ?? null,
    team_b: teams[1] ?? null,
    team_b_short: infoFor(teams[1])?.shortname ?? null,
    team_b_logo: infoFor(teams[1])?.img ?? null,
    start_time: m.dateTimeGMT ? new Date(m.dateTimeGMT + "Z").toISOString() : null,
    toss_winner: m.tossWinner ?? null,
    toss_decision: m.tossChoice ?? null,
    result_text: m.matchWinner ? `${m.matchWinner} won` : m.status ?? null,
    has_squads: Boolean(m.hasSquad),
    raw: m as never,
  };

  const { data, error } = await supabase
    .from("matches")
    .upsert(row, { onConflict: "external_id" })
    .select("id, external_id, name, format, status, venue, team_a, team_b, start_time, has_squads")
    .single();
  if (error) throw new Error(`upsertMatch failed: ${error.message}`);

  return {
    id: data.id,
    externalId: data.external_id,
    name: data.name,
    format: data.format as MatchFormat,
    status: data.status as IngestedMatch["status"],
    venue: data.venue,
    teamA: data.team_a,
    teamB: data.team_b,
    startTime: data.start_time,
    hasSquads: data.has_squads,
  };
}

/**
 * Ingest squads for a match: upsert players and match_players. Returns the
 * enriched squad. A team with <= 12 listed players is treated as a likely
 * announced XI; a larger list is treated as a full squad (unconfirmed XI).
 */
export async function ingestSquads(
  matchId: string,
  squads: CricSquadTeam[],
): Promise<SquadMember[]> {
  const supabase = getServiceClient();
  const members: SquadMember[] = [];

  for (const team of squads) {
    const teamName = team.teamName ?? "Unknown";
    const likelyXI = team.players.length <= 12;

    for (let i = 0; i < team.players.length; i++) {
      const p = team.players[i];
      const role = mapRole(p.role, p.bowlingStyle);
      const inAnnouncedXI = likelyXI;

      // upsert player (prefer external id, else by lowercased name)
      let playerId: string;
      if (p.id) {
        const { data } = await supabase
          .from("players")
          .upsert(
            {
              external_id: p.id,
              name: p.name,
              country: p.country ?? null,
              role,
              batting_style: p.battingStyle ?? null,
              bowling_style: p.bowlingStyle ?? null,
              raw: p as never,
            },
            { onConflict: "external_id" },
          )
          .select("id")
          .single();
        playerId = data!.id;
      } else {
        const { data: existing } = await supabase
          .from("players")
          .select("id")
          .ilike("name", p.name)
          .maybeSingle();
        if (existing) {
          playerId = existing.id;
        } else {
          const { data } = await supabase
            .from("players")
            .insert({ name: p.name, country: p.country ?? null, role })
            .select("id")
            .single();
          playerId = data!.id;
        }
      }

      const credits = estimateCredits(role, inAnnouncedXI);
      const { data: mp } = await supabase
        .from("match_players")
        .upsert(
          {
            match_id: matchId,
            player_id: playerId,
            team: teamName,
            team_short: team.shortname ?? null,
            role,
            credits,
            credits_estimated: true,
            in_announced_xi: inAnnouncedXI,
            batting_order: i + 1,
          },
          { onConflict: "match_id,player_id" },
        )
        .select("id")
        .single();

      members.push({
        matchPlayerId: mp!.id,
        playerId,
        name: p.name,
        team: teamName,
        teamShort: team.shortname ?? null,
        role,
        credits,
        creditsEstimated: true,
        inAnnouncedXI,
        isImpactSub: false,
        battingOrder: i + 1,
        battingStyle: p.battingStyle ?? null,
        bowlingStyle: p.bowlingStyle ?? null,
      });
    }
  }

  if (members.length > 0) {
    await supabase.from("matches").update({ has_squads: true }).eq("id", matchId);
  }
  return members;
}
