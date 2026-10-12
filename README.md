# Fantasy Cricket Match Day Optimizer

A production-quality web app that helps a serious Dream11 player pick a **valid, submittable** XI for a given match — with Captain/Vice-Captain calls backed by **match-specific reasoning**, and a **post-match learning loop** that detects where the model is wrong and adjusts its own scoring weights.

- **Live external data** from a cricket API (squads, fixtures, scorecards), cached in Supabase.
- **All AI via Google Gemini Flash** (`@google/genai`) — structured JSON output + Google Search grounding for live pitch / weather / XI context. No Anthropic/Claude API anywhere in the app.
- **Deterministic scoring + exact optimizer + hard validator in code** — the LLM never decides team legality.
- **Self-improving:** stores predicted vs actual, finds biased segments, suggests weight changes, and applies them as new active weight versions.

## How it works (pipeline)

```
Match → Gather (squads + grounded context) → Score players (weighted model, code)
      → Gemini reasoning (bounded adjustments, risk, C/VC) → Optimize XI (ILP, code)
      → Validate Dream11 rules (pure fn) → Save prediction
Post-match → enter actual points → residual analysis → weight suggestions → apply → next match uses new weights
```

1. **Gather** — `currentMatches` / `match_squad` from the cricket API (CricketData.org / CricAPI), normalized into Supabase. Live conditions (pitch, weather, toss, XI news) via **Gemini + Google Search grounding**.
2. **Score (deterministic, `src/lib/scoring/engine.ts`)** — a transparent linear model: role baseline + weighted, points-scale feature deltas (recent-form proxy, venue/opposition, role-vs-pitch fit, batting position, bowling workload) + role bonuses + announced-XI availability. Weights live in Supabase (`scoring_weights`, versioned).
3. **Gemini reasoning (`src/lib/ai/reasoning.ts`)** — structured JSON: per-player match-specific reason, risk flag, a **bounded** score adjustment (±12, must be justified), an estimated Dream11 credit, and C/VC picks with confident justifications.
4. **Optimize (`src/lib/scoring/optimizer.ts`)** — exact **integer linear program** (`javascript-lp-solver`) picking the best 11 by expected points subject to every Dream11 constraint. C = 2×, VC = 1.5×.
5. **Validate (`src/lib/scoring/validator.ts`)** — pure `validateDream11Team()` hard-checks every rule. The UI never shows a team that fails validation; swaps re-validate live.

## Dream11 rules — Safe mode by default

Published sources disagree on the exact current role limits, so the app defaults to **Safe mode**, which builds teams valid under *both* interpretations — guaranteeing "submittable with zero corrections". A toggle switches to Relaxed mode. Rules live in one file: `src/lib/dream11Rules.ts`.

| Rule | Safe mode (default) | Relaxed mode |
|---|---|---|
| Players | 11 | 11 |
| Credits | ≤ 100.0 | ≤ 100.0 |
| Max from one team | 7 | 10 |
| Wicket-Keepers | 1–4 | 1–8 |
| Batters | 3–6 | 1–8 |
| All-Rounders | 1–4 | 1–8 |
| Bowlers | 3–6 | 1–8 |
| Captain / Vice-Captain | 1 each, different; C 2× / VC 1.5× | same |

- **Credits are estimated** (not provided by the free data source): a documented baseline formula per role (`estimateCredits`) plus a bounded Gemini estimate, labelled *estimated* in the UI and overridable. In Safe mode with estimated credits the optimizer targets ≤ 99.5 (a 0.5-credit safety buffer).
- **Roles** map to Dream11 tags (WK/BAT/AR/BOWL) and are overridable per player.
- **Announced XI** players get an availability bonus; unconfirmed players take an uncertainty penalty.

## The learning loop

- Enter actual Dream11 points per selected player after a match (`actual_points`).
- `src/lib/insights/residuals.ts` (pure, unit-tested) computes residuals (actual − predicted) segmented by **format, pitch type, role, batting band, availability**, flags segments with consistent bias, and proposes **bounded weight nudges** (a gradient step with guardrails + a minimum sample size).
- Gemini writes a plain-English explanation of each suggestion.
- **Apply** a suggestion → a new active `scoring_weights` version used by future matches. Weight history + before/after accuracy (MAE by version) + rollback are in the Insights dashboard.

## Tech stack

Next.js (App Router) + TypeScript · Tailwind CSS v4 · Framer Motion · lucide-react · Recharts · Supabase (Postgres + RLS) · Gemini Flash (`@google/genai`, structured output + Google Search grounding) · zod validation everywhere · Vitest + Playwright.

Keys stay **server-side** (route handlers / server actions). RLS is enabled on every table; the app reads/writes only via the service role key, so the public anon key has zero access.

## Architecture

```
src/
  app/                     routes + API route handlers (server-only keys)
    api/                   analyze, matches/sync, predictions/save, actuals, insights/*, weights/rollback, health
    match/[id]/            analysis page + actuals entry
    insights/              self-improvement dashboard
    components-map/        swimlane Components Map
  lib/
    dream11Rules.ts        Safe/Relaxed rule sets (single source of truth)
    scoring/               engine, optimizer (ILP), validator, weights
    cricket/               API client (zod + cache + quota), ingest
    ai/                    gemini client, grounded context, reasoning
    data/                  supabase client, matches, predictions, weights, cache, features
    insights/              residuals (pure), compute, apply, metrics
  components/              UI (match board, team view, insights, components map)
tests/                     Vitest unit tests (validator, optimizer, engine, residuals)
```

## Environment variables

See `.env.example`. Required:

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key (no DB access under RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only**; bypasses RLS |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | current Flash model id (default `gemini-3.8-flash`) |
| `CRICKET_API_KEY` | CricketData.org / CricAPI free key |

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
npm test                     # unit tests (Vitest)
npm run test:e2e             # Playwright smoke test
npm run seed                 # seed real recent matches + run the pipeline
```

## Scripts

- `npm run dev` / `build` / `start`
- `npm test` — Vitest unit tests (validator, optimizer, scoring, residual analysis)
- `npm run test:e2e` — Playwright: match → analyse → valid team
- `npm run seed` — seed the DB from real recent completed matches and run the full pipeline so the Insights dashboard is populated
- `npm run export:map` — render `docs/components-map.png` + `.pdf` from `/components-map`

## Deliverables

- **Live URL:** https://fantasy-cricket-optimizer-rouge.vercel.app
- **Repo:** https://github.com/sakshichugh-build/fantasy-cricket-optimizer
- **Components Map:** `/components-map` in the app, plus `COMPONENTS_MAP.md` and `docs/components-map.png`.
