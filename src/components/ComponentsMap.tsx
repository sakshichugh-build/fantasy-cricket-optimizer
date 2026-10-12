"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type Stage = "Trigger" | "Input" | "Context" | "Processing" | "AI" | "Output";
const STAGES: Stage[] = ["Trigger", "Input", "Context", "Processing", "AI", "Output"];
const COL_INDEX: Record<Stage, number> = {
  Trigger: 2,
  Input: 3,
  Context: 4,
  Processing: 5,
  AI: 6,
  Output: 7,
};

type Tone = "blue" | "green" | "yellow" | "pink" | "peach";
const TONE: Record<Tone, { bg: string; border: string }> = {
  blue: { bg: "#dbe7ff", border: "#9bb8f0" },
  green: { bg: "#d7f2e3", border: "#8fd3ad" },
  yellow: { bg: "#fdf3cf", border: "#e7cf84" },
  pink: { bg: "#fbddee", border: "#e8a6cb" },
  peach: { bg: "#ffe2cf", border: "#f3b183" },
};
const LANE_BANDS = ["#efe9f7", "#e8f0fb", "#fdf8e4", "#e7f6ee", "#fdeadd"];

interface Box {
  id: string;
  stage: Stage;
  tone: Tone;
  lines: string[];
}
interface Lane {
  actor: string;
  role: string;
  boxes: Box[];
}

const GRID1: Lane[] = [
  { actor: "Aryan", role: "User", boxes: [{ id: "g1-aryan", stage: "Trigger", tone: "blue", lines: ["Picks an upcoming", "match in the app"] }] },
  { actor: "Cricket Data API", role: "Live data", boxes: [{ id: "g1-cric", stage: "Input", tone: "blue", lines: ["Fetches squads,", "playing XI,", "recent player stats"] }] },
  { actor: "Gemini API", role: "Context · Search grounding", boxes: [{ id: "g1-gem-ctx", stage: "Context", tone: "green", lines: ["Pulls pitch report,", "weather, venue history,", "team / injury news"] }] },
  { actor: "Supabase", role: "Memory", boxes: [{ id: "g1-supa", stage: "Context", tone: "green", lines: ["Supplies active scoring", "weights + past", "error patterns"] }] },
  { actor: "Scoring Engine", role: "Code", boxes: [{ id: "g1-score", stage: "Processing", tone: "yellow", lines: ["Scores each player", "Optimizer picks best 11", "Validator checks rules"] }] },
  { actor: "Gemini API", role: "Reasoning", boxes: [{ id: "g1-gem-rsn", stage: "AI", tone: "pink", lines: ["Writes match-specific", "reasons · Picks C & VC", "with justification"] }] },
  { actor: "Review Gate", role: "Aryan", boxes: [{ id: "g1-review", stage: "Output", tone: "peach", lines: ["Reviews team,", "swaps if needed →", "Copies into Dream11"] }] },
];
const FLOW1 = ["g1-aryan", "g1-cric", "g1-gem-ctx", "g1-supa", "g1-score", "g1-gem-rsn", "g1-review"];

const GRID2: Lane[] = [
  { actor: "Aryan", role: "User", boxes: [
    { id: "g2-trigger", stage: "Trigger", tone: "blue", lines: ["Match ends"] },
    { id: "g2-input", stage: "Input", tone: "blue", lines: ["Enters actual", "Dream11 points", "per player"] },
  ] },
  { actor: "Supabase", role: "Memory", boxes: [
    { id: "g2-store", stage: "Context", tone: "green", lines: ["Stores predicted", "vs actual per player"] },
    { id: "g2-calc", stage: "Processing", tone: "yellow", lines: ["Calculates error by", "format, venue,", "role, position"] },
  ] },
  { actor: "Gemini API", role: "Analyst", boxes: [{ id: "g2-ai", stage: "AI", tone: "pink", lines: ["Explains patterns", "Suggests weight changes"] }] },
  { actor: "Review Gate", role: "Aryan", boxes: [{ id: "g2-review", stage: "Output", tone: "peach", lines: ["Approves new weights →", "Next match uses them"] }] },
];
const FLOW2 = ["g2-trigger", "g2-input", "g2-store", "g2-calc", "g2-ai", "g2-review"];

export function ComponentsMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [paths, setPaths] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const register = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) boxRefs.current.set(id, el);
    else boxRefs.current.delete(id);
  }, []);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect();
    setSize({ w: base.width, h: base.height });
    const center = (id: string) => {
      const el = boxRefs.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left - base.left,
        right: r.right - base.left,
        top: r.top - base.top,
        bottom: r.bottom - base.top,
        cx: r.left - base.left + r.width / 2,
        cy: r.top - base.top + r.height / 2,
      };
    };
    const route = (fromId: string, toId: string): string | null => {
      const a = center(fromId);
      const b = center(toId);
      if (!a || !b) return null;
      const vertical = Math.abs(b.cy - a.cy) > Math.abs(b.cx - a.cx);
      if (vertical) {
        const sy = b.cy > a.cy ? a.bottom : a.top;
        const ey = b.cy > a.cy ? b.top : b.bottom;
        const midY = (sy + ey) / 2;
        return `M ${a.cx} ${sy} L ${a.cx} ${midY} L ${b.cx} ${midY} L ${b.cx} ${ey}`;
      }
      const sx = b.cx > a.cx ? a.right : a.left;
      const ex = b.cx > a.cx ? b.left : b.right;
      const midX = (sx + ex) / 2;
      return `M ${sx} ${a.cy} L ${midX} ${a.cy} L ${midX} ${b.cy} L ${ex} ${b.cy}`;
    };
    const p: string[] = [];
    for (const flow of [FLOW1, FLOW2]) {
      for (let i = 0; i < flow.length - 1; i++) {
        const seg = route(flow[i], flow[i + 1]);
        if (seg) p.push(seg);
      }
    }
    setPaths(p);
    // feedback loop: g2 review -> g1 supabase (self-improvement cycle)
    const a = center("g2-review");
    const b = center("g1-supa");
    if (a && b) {
      setFeedback(`M ${a.right} ${a.cy} L ${size.w - 8} ${a.cy} L ${size.w - 8} ${b.cy} L ${b.right} ${b.cy}`);
    }
  }, [size.w]);

  useLayoutEffect(() => {
    recompute();
    const ro = new ResizeObserver(() => recompute());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", recompute);
    const t = setTimeout(recompute, 300); // after fonts settle
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
      clearTimeout(t);
    };
  }, [recompute]);

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-[#d8cfc4] bg-white p-4 text-[#2b2b2b] shadow-sm sm:p-6">
      <div className="min-w-[860px]">
        <h2 className="mb-4 text-center font-display text-lg font-bold text-[#4a4038]">
          Case 8 · Aryan / Match Day Optimizer — Components Map
        </h2>

        <div ref={containerRef} className="relative">
          <svg
            className="pointer-events-none absolute inset-0 z-20 h-full w-full"
            width={size.w}
            height={size.h}
          >
            <defs>
              <marker id="cm-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8" fill="none" stroke="#7a6f64" strokeWidth="1.4" />
              </marker>
              <marker id="cm-arrow-fb" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8" fill="none" stroke="#c06b4f" strokeWidth="1.4" />
              </marker>
            </defs>
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#7a6f64" strokeWidth="1.5" strokeDasharray="5 4" markerEnd="url(#cm-arrow)" />
            ))}
            {feedback && (
              <path d={feedback} fill="none" stroke="#c06b4f" strokeWidth="1.6" strokeDasharray="5 4" markerEnd="url(#cm-arrow-fb)" />
            )}
          </svg>

          <GridBlock title="Match-day flow" lanes={GRID1} register={register} />
          <div className="my-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#8a7f73]">
            <span className="h-px flex-1 bg-[#e0d8cc]" /> Post-match learning loop <span className="h-px flex-1 bg-[#e0d8cc]" />
          </div>
          <GridBlock title="Learning loop" lanes={GRID2} register={register} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-[#6b6157]">
          <Legend tone="blue" label="Trigger / Input" />
          <Legend tone="green" label="External context" />
          <Legend tone="yellow" label="Processing" />
          <Legend tone="pink" label="AI generation" />
          <Legend tone="peach" label="Review / Output" />
          <span className="ml-auto flex items-center gap-1">
            <span className="inline-block h-0 w-6 border-t-2 border-dashed border-[#c06b4f]" /> self-improvement loop
          </span>
        </div>
      </div>
    </div>
  );
}

function GridBlock({
  lanes,
  register,
}: {
  title: string;
  lanes: Lane[];
  register: (id: string) => (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d8cfc4]">
      {/* header row */}
      <div className="grid" style={{ gridTemplateColumns: "150px repeat(6, 1fr)" }}>
        <div className="bg-[#6f6459] px-3 py-2 text-xs font-bold text-white">Actor</div>
        {STAGES.map((s) => (
          <div key={s} className="border-l border-[#8a7f73] bg-[#6f6459] px-3 py-2 text-center text-xs font-bold text-white">
            {s}
          </div>
        ))}
      </div>
      {/* lanes */}
      {lanes.map((lane, li) => (
        <div
          key={`${lane.actor}-${li}`}
          className="grid border-t border-[#e0d8cc]"
          style={{ gridTemplateColumns: "150px repeat(6, 1fr)", background: LANE_BANDS[li % LANE_BANDS.length] }}
        >
          <div className="bg-[#6f6459] px-3 py-3 text-white">
            <div className="text-xs font-bold leading-tight">{lane.actor}</div>
            <div className="text-[10px] text-white/70">({lane.role})</div>
          </div>
          {STAGES.map((s) => {
            const box = lane.boxes.find((b) => b.stage === s);
            return (
              <div key={s} className="relative flex items-center justify-center border-l border-[#e6ddd0] px-2 py-3" style={{ gridColumn: COL_INDEX[s] }}>
                {box && (
                  <div
                    ref={register(box.id)}
                    className="relative z-10 w-full rounded-lg border px-2 py-1.5 text-center text-[11px] font-medium leading-tight shadow-sm"
                    style={{ background: TONE[box.tone].bg, borderColor: TONE[box.tone].border }}
                  >
                    {box.lines.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Legend({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded border" style={{ background: TONE[tone].bg, borderColor: TONE[tone].border }} />
      {label}
    </span>
  );
}
