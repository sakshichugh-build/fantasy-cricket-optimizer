/**
 * Dream11 only lists matches people actually follow: internationals between
 * recognised nations, and major franchise/domestic competitions. The free
 * cricket API also returns obscure associate sub-regional qualifiers and minor
 * domestic divisions, which would never appear on Dream11. This classifier keeps
 * the former and drops the latter, so the app mirrors a real Dream11 match list.
 */

// Competitions Dream11 lists (substring match, case-insensitive).
const INCLUDE_KEYWORDS = [
  "tour of", // bilateral internationals (e.g. Australia tour of South Africa)
  "asia cup",
  "world cup", // main events; sub-regional qualifiers are excluded below
  "champions trophy",
  "tri-series",
  "tri series",
  "t20i series",
  "odi series",
  // Indian domestic
  "ranji trophy",
  "vijay hazare",
  "syed mushtaq ali",
  "duleep trophy",
  "irani",
  // franchise leagues
  "indian premier league",
  "ipl",
  "big bash",
  "bbl",
  "pakistan super league",
  "psl",
  "caribbean premier league",
  "cpl",
  "sa20",
  "ilt20",
  "international league t20",
  "the hundred",
  "t20 blast",
  "vitality blast",
  "super smash",
  "major league cricket",
  "mlc",
  "bangladesh premier league",
  "lanka premier league",
  "sheffield shield",
  "county championship",
  "the ashes",
  "ashes",
];

// Hard excludes — never on Dream11 (associate minnows / minor divisions).
const EXCLUDE_KEYWORDS = [
  "sub regional",
  "sub-regional",
  "regional qualifier",
  "regional final",
  "challenge league",
  "division two",
  "division three",
  "division 2",
  "division 3",
  "pepsi",
  "continental cup",
];

/** Full-member nations + major sides whose bilateral games Dream11 always lists. */
const MAJOR_TEAMS = [
  "india",
  "australia",
  "england",
  "pakistan",
  "south africa",
  "new zealand",
  "sri lanka",
  "bangladesh",
  "west indies",
  "afghanistan",
  "ireland",
  "zimbabwe",
];

export function isDream11Relevant(name: string | null, teamA?: string | null, teamB?: string | null): boolean {
  const n = (name ?? "").toLowerCase();
  if (EXCLUDE_KEYWORDS.some((k) => n.includes(k))) return false;
  if (INCLUDE_KEYWORDS.some((k) => n.includes(k))) return true;

  // Fallback: a game between two recognised major nations (any format).
  const a = (teamA ?? "").toLowerCase();
  const b = (teamB ?? "").toLowerCase();
  const major = (t: string) => MAJOR_TEAMS.some((m) => t.includes(m));
  return major(a) && major(b);
}
