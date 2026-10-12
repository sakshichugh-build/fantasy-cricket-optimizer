import type { Dream11Role } from "./types";

/** Format an ISO timestamp in IST (Aryan is in India). */
export function formatIST(iso: string | null, opts?: { withDate?: boolean }): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  if (opts?.withDate === false) return `${time} IST`;
  const date = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  }).format(d);
  return `${date}, ${time} IST`;
}

export function relativeToStart(iso: string | null): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return diff > 0 ? `in ${d}d` : `${d}d ago`;
  if (h >= 1) return diff > 0 ? `in ${h}h` : `${h}h ago`;
  const m = Math.floor(abs / 60_000);
  return diff > 0 ? `in ${m}m` : `${m}m ago`;
}

export const ROLE_LABEL: Record<Dream11Role, string> = {
  WK: "Wicket-Keeper",
  BAT: "Batter",
  AR: "All-Rounder",
  BOWL: "Bowler",
};

export const ROLE_SHORT: Record<Dream11Role, string> = {
  WK: "WK",
  BAT: "BAT",
  AR: "AR",
  BOWL: "BOWL",
};

export function riskColor(risk?: string | null): string {
  switch ((risk || "").toLowerCase()) {
    case "high":
      return "var(--danger)";
    case "medium":
      return "var(--warn)";
    case "low":
      return "var(--good)";
    default:
      return "var(--muted)";
  }
}

export function pitchLabel(pitch?: string | null): string {
  switch (pitch) {
    case "spin":
      return "Spin-friendly";
    case "pace":
      return "Pace/seam";
    case "batting":
      return "Batting track";
    case "bowling":
      return "Bowler-friendly";
    case "balanced":
      return "Balanced";
    default:
      return "Unknown";
  }
}

export function statusMeta(status: string): { label: string; color: string } {
  switch (status) {
    case "live":
      return { label: "LIVE", color: "var(--danger)" };
    case "completed":
      return { label: "Completed", color: "var(--muted)" };
    default:
      return { label: "Upcoming", color: "var(--accent)" };
  }
}
