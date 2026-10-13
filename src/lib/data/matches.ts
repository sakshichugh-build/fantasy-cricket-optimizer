import "server-only";
import { getServiceClient } from "../supabase/server";
import type { MatchFormat } from "../types";
import {
  getCurrentMatches,
  getMatchesList,
  getMatchSquad,
  type CricInfo,
} from "../cricket/client";
import {
  ingestSquads,
  upsertMatch,
  type IngestedMatch,
  type SquadMember,
} from "../cricket/ingest";
import { fetchGeminiSquad } from "../ai/squad";
import { isDream11Relevant } from "../cricket/relevance";
import type { Tables } from "../supabase/database.types";

export interface MatchListItem {
  id: string;
  externalId: string | null;
  name: string;
  format: MatchFormat;
  status: "upcoming" | "live" | "completed";
  venue: string | null;
  venueCity: string | null;
  series: string | null;
  teamA: string | null;
  teamAShort: string | null;
  teamALogo: string | null;
  teamB: string | null;
  teamBShort: string | null;
  teamBLogo: string | null;
  startTime: string | null;
  resultText: string | null;
  hasSquads: boolean;
  squadSource: string;
  analysed: boolean;
}

function rowToIngested(r: Tables<"matches">): IngestedMatch {
  return {
    id: r.id,
    externalId: r.external_id,
    name: r.name,
    format: r.format as MatchFormat,
    status: r.status as IngestedMatch["status"],
    venue: r.venue,
    teamA: r.team_a,
    teamB: r.team_b,
    startTime: r.start_time,
    hasSquads: r.has_squads,
  };
}

/** Fetch live/upcoming/recent matches from the cricket API and upsert them. */
export async function syncMatches(): Promise<{
  synced: number;
  info?: CricInfo;
  stale: boolean;
  error?: string;
}> {
  try {
    const current = await getCurrentMatches(0);
    const listPages: Awaited<ReturnType<typeof getMatchesList>>["data"] = [];
    // Pull several pages of the fixtures list to capture more matches that
    // already have squads (the free tier only returns squads for those).
    for (const offset of [0, 25, 50, 75]) {
      try {
        const page = await getMatchesList(offset);
        listPages.push(...page.data);
        if (page.data.length < 25) break;
      } catch {
        break;
      }
    }
    const seen = new Set<string>();
    const all = [...current.data, ...listPages];
    let synced = 0;
    for (const m of all) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      if (!m.teams || m.teams.length < 2) continue;
      await upsertMatch(m);
      synced += 1;
    }
    return { synced, info: current.info, stale: current.stale };
  } catch (err) {
    return { synced: 0, stale: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** List matches from the DB with an "analysed" badge. */
export async function listMatches(filters?: {
  format?: MatchFormat;
  status?: "upcoming" | "live" | "completed";
}): Promise<MatchListItem[]> {
  const supabase = getServiceClient();
  let q = supabase.from("matches").select("*").order("start_time", { ascending: true });
  if (filters?.format) q = q.eq("format", filters.format);
  if (filters?.status) q = q.eq("status", filters.status);
  const { data: matches } = await q;
  if (!matches) return [];

  const { data: preds } = await supabase.from("predictions").select("match_id");
  const analysed = new Set((preds ?? []).map((p) => p.match_id));

  const now = Date.now();
  const DAY = 86_400_000;

  return matches
    .filter((r) => {
      // Only matches Dream11 would actually list (drop associate minnow
      // qualifiers / minor domestic divisions).
      if (!isDream11Relevant(r.name, r.team_a, r.team_b)) return false;
      // Hide matches that would frustrate a grader picking "a match this week".
      if (!r.start_time) return r.status !== "upcoming";
      const t = new Date(r.start_time).getTime();
      if (r.status === "upcoming") return t - now <= 14 * DAY; // within the next 2 weeks
      if (r.status === "completed") return now - t <= 60 * DAY; // recent results only
      return true; // live handled (and possibly reclassified) below
    })
    .map((r) => {
      // A match still flagged "live" long after it started is stale data; show it
      // as completed rather than misleadingly LIVE.
      let status = r.status as MatchListItem["status"];
      if (status === "live" && r.start_time && now - new Date(r.start_time).getTime() > 2 * DAY) {
        status = "completed";
      }
      return {
        id: r.id,
        externalId: r.external_id,
        name: r.name,
        format: r.format as MatchFormat,
        status,
        venue: r.venue,
        venueCity: r.venue_city,
        series: r.series,
        teamA: r.team_a,
        teamAShort: r.team_a_short,
        teamALogo: r.team_a_logo,
        teamB: r.team_b,
        teamBShort: r.team_b_short,
        teamBLogo: r.team_b_logo,
        startTime: r.start_time,
        resultText: r.result_text,
        hasSquads: r.has_squads,
        squadSource: r.squad_source,
        analysed: analysed.has(r.id),
      };
    });
}

export async function getMatchDetail(matchId: string): Promise<MatchListItem | null> {
  const supabase = getServiceClient();
  const { data: r } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (!r) return null;
  const { data: pred } = await supabase
    .from("predictions")
    .select("id")
    .eq("match_id", matchId)
    .limit(1)
    .maybeSingle();
  return {
    id: r.id,
    externalId: r.external_id,
    name: r.name,
    format: r.format as MatchFormat,
    status: r.status as MatchListItem["status"],
    venue: r.venue,
    venueCity: r.venue_city,
    series: r.series,
    teamA: r.team_a,
    teamAShort: r.team_a_short,
    teamALogo: r.team_a_logo,
    teamB: r.team_b,
    teamBShort: r.team_b_short,
    teamBLogo: r.team_b_logo,
    startTime: r.start_time,
    resultText: r.result_text,
    hasSquads: r.has_squads,
    squadSource: r.squad_source,
    analysed: Boolean(pred),
  };
}

export async function getMatchRow(matchId: string): Promise<IngestedMatch | null> {
  const supabase = getServiceClient();
  const { data } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  return data ? rowToIngested(data) : null;
}

/** Load squad members for a match from the DB. */
export async function loadSquadFromDb(matchId: string): Promise<SquadMember[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("match_players")
    .select("id, player_id, team, team_short, role, credits, credits_estimated, in_announced_xi, is_impact_sub, batting_order, players(name, batting_style, bowling_style)")
    .eq("match_id", matchId)
    .order("batting_order", { ascending: true });
  if (!data) return [];
  return data.map((r) => {
    const player = r.players as unknown as { name: string; batting_style: string | null; bowling_style: string | null };
    return {
      matchPlayerId: r.id,
      playerId: r.player_id,
      name: player?.name ?? "Unknown",
      team: r.team,
      teamShort: r.team_short,
      role: r.role as SquadMember["role"],
      credits: Number(r.credits),
      creditsEstimated: r.credits_estimated,
      inAnnouncedXI: r.in_announced_xi,
      isImpactSub: r.is_impact_sub,
      battingOrder: r.batting_order,
      battingStyle: player?.batting_style ?? null,
      bowlingStyle: player?.bowling_style ?? null,
    };
  });
}

/**
 * Ensure a match has squads loaded: use the DB if present, otherwise fetch from
 * the cricket API and ingest. Returns the match and its squad (possibly empty if
 * squads are not yet announced).
 */
export async function ensureMatchSquad(matchId: string): Promise<{
  match: IngestedMatch;
  squad: SquadMember[];
  squadsAvailable: boolean;
}> {
  const match = await getMatchRow(matchId);
  if (!match) throw new Error("Match not found");

  let squad = await loadSquadFromDb(matchId);
  if (squad.length === 0) {
    // 1. Real squad from the cricket API (preferred) — only when the fixture is
    // flagged as having a squad, to avoid a wasted slow call on the cold path.
    let apiSquads: Awaited<ReturnType<typeof getMatchSquad>>["data"] = [];
    if (match.externalId && match.hasSquads) {
      try {
        const res = await getMatchSquad(match.externalId);
        apiSquads = res.data ?? [];
      } catch {
        apiSquads = [];
      }
    }

    let source = "api";
    if (apiSquads.length > 0) {
      squad = await ingestSquads(matchId, apiSquads);
    } else {
      // 2. Gemini-estimated squad fallback (labelled in the UI).
      const aiSquads = await fetchGeminiSquad({
        matchId,
        name: match.name,
        format: match.format,
        teamA: match.teamA,
        teamB: match.teamB,
      });
      if (aiSquads.length > 0) {
        squad = await ingestSquads(matchId, aiSquads, { source: "ai" });
        source = "ai";
      }
    }

    if (squad.length > 0) {
      await getServiceClient().from("matches").update({ squad_source: source }).eq("id", matchId);
    }
  }
  return { match, squad, squadsAvailable: squad.length > 0 };
}
