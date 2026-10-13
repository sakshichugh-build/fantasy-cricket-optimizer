"use client";

import { Crown, Shield } from "lucide-react";
import type { SavedPredictionPlayer } from "@/lib/data/predictions";
import type { Dream11Role } from "@/lib/types";
import { ROLE_COLOR, ROLE_LABEL } from "@/lib/format";

const ROWS: { role: Dream11Role; y: number }[] = [
  { role: "WK", y: 16 },
  { role: "BAT", y: 37 },
  { role: "AR", y: 59 },
  { role: "BOWL", y: 81 },
];

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function xFor(i: number, n: number): number {
  if (n <= 1) return 50;
  return 17 + (66 * i) / (n - 1);
}

export function CricketField({
  players,
  captainId,
  viceCaptainId,
}: {
  players: SavedPredictionPlayer[];
  captainId: string | null;
  viceCaptainId: string | null;
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-[#0d3b22] bg-[#0a2d1a]">
      {/* The ground */}
      <svg viewBox="0 0 500 600" className="block w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="grass" cx="50%" cy="38%" r="75%">
            <stop offset="0%" stopColor="#2aa862" />
            <stop offset="60%" stopColor="#1e9154" />
            <stop offset="100%" stopColor="#15723f" />
          </radialGradient>
          <linearGradient id="pitch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e4cd98" />
            <stop offset="50%" stopColor="#d7bd81" />
            <stop offset="100%" stopColor="#c9ac6c" />
          </linearGradient>
          <radialGradient id="flood" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,240,0.5)" />
            <stop offset="100%" stopColor="rgba(255,255,240,0)" />
          </radialGradient>
          <pattern id="stripes" width="500" height="68" patternUnits="userSpaceOnUse">
            <rect width="500" height="34" fill="rgba(255,255,255,0.045)" />
            <rect y="34" width="500" height="34" fill="rgba(0,0,0,0.045)" />
          </pattern>
        </defs>

        {/* beyond-boundary turf */}
        <rect width="500" height="600" fill="#0f5c34" />
        {/* floodlight pools */}
        <circle cx="70" cy="70" r="150" fill="url(#flood)" />
        <circle cx="430" cy="70" r="150" fill="url(#flood)" />
        <circle cx="70" cy="540" r="130" fill="url(#flood)" />
        <circle cx="430" cy="540" r="130" fill="url(#flood)" />

        {/* field + mowing stripes */}
        <ellipse cx="250" cy="300" rx="238" ry="288" fill="url(#grass)" />
        <ellipse cx="250" cy="300" rx="238" ry="288" fill="url(#stripes)" />
        {/* boundary rope */}
        <ellipse cx="250" cy="300" rx="238" ry="288" fill="none" stroke="#f3f6ef" strokeWidth="4" opacity="0.85" />
        <ellipse cx="250" cy="300" rx="232" ry="281" fill="none" stroke="#9bd3b0" strokeWidth="1.5" opacity="0.5" />
        {/* 30-yard circle */}
        <ellipse cx="250" cy="300" rx="150" ry="180" fill="none" stroke="#eafdf1" strokeWidth="2" strokeDasharray="7 8" opacity="0.5" />

        {/* pitch strip */}
        <rect x="222" y="140" width="56" height="320" rx="4" fill="url(#pitch)" stroke="rgba(0,0,0,0.12)" />
        {/* creases */}
        <line x1="222" y1="176" x2="278" y2="176" stroke="#fff" strokeWidth="2" opacity="0.8" />
        <line x1="222" y1="424" x2="278" y2="424" stroke="#fff" strokeWidth="2" opacity="0.8" />
        <line x1="250" y1="140" x2="250" y2="460" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        {/* stumps */}
        {[240, 250, 260].map((x) => (
          <line key={`t${x}`} x1={x} y1="150" x2={x} y2="166" stroke="#5a3b1a" strokeWidth="2.4" />
        ))}
        {[240, 250, 260].map((x) => (
          <line key={`b${x}`} x1={x} y1="434" x2={x} y2="450" stroke="#5a3b1a" strokeWidth="2.4" />
        ))}

        {/* floodlight pylons (top corners) */}
        {[40, 460].map((x) => (
          <g key={x} opacity="0.9">
            <line x1={x} y1="30" x2={x} y2="78" stroke="#cfe6d6" strokeWidth="2.5" />
            <rect x={x - 13} y="16" width="26" height="14" rx="2" fill="#dfeee4" />
            {[-9, -3, 3, 9].map((dx) => (
              <circle key={dx} cx={x + dx} cy="23" r="1.6" fill="#fffde7" />
            ))}
          </g>
        ))}
      </svg>

      {/* Player tokens overlay */}
      <div className="absolute inset-0">
        {ROWS.map(({ role, y }) => {
          const group = players.filter((p) => p.role === role);
          return group.map((p, i) => {
            const x = xFor(i, group.length);
            const isC = p.playerId === captainId;
            const isVc = p.playerId === viceCaptainId;
            const color = ROLE_COLOR[role];
            return (
              <div
                key={p.playerId}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${x}%`, top: `${y}%`, width: 76 }}
                title={`${p.name} · ${ROLE_LABEL[role]} · ${p.predictedPoints.toFixed(0)} pts`}
              >
                <div className="relative">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-full border-2 bg-[#06271699] font-display text-[13px] font-bold text-white backdrop-blur-sm"
                    style={{
                      borderColor: color,
                      boxShadow: isC
                        ? `0 0 0 2px #f6b63d, 0 4px 16px -4px ${color}`
                        : `0 4px 14px -5px ${color}`,
                    }}
                  >
                    {p.predictedPoints.toFixed(0)}
                  </div>
                  {(isC || isVc) && (
                    <span
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[#06271a] text-[9px] font-bold"
                      style={{ background: isC ? "#f6b63d" : "#c7d2e0", color: "#111" }}
                    >
                      {isC ? <Crown size={11} /> : <Shield size={11} />}
                    </span>
                  )}
                </div>
                <span className="mt-1 max-w-full truncate rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {lastName(p.name)}
                </span>
              </div>
            );
          });
        })}
      </div>

      {/* role legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-[#0d3b22] bg-[#06271a] px-3 py-2">
        {(Object.keys(ROLE_COLOR) as Dream11Role[]).map((r) => (
          <span key={r} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#cfe6d6]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_COLOR[r] }} />
            {ROLE_LABEL[r]}
          </span>
        ))}
      </div>
    </div>
  );
}
