import Link from "next/link";
import { Activity, BarChart3, Trophy } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-30 glass">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_6px_20px_-8px_var(--accent)]">
            <Trophy size={18} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-bold tracking-tight">Match Day Optimizer</span>
            <span className="text-[11px] text-muted">Dream11 · live data + Gemini</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1.5">
          <Link href="/" className="btn btn-ghost !px-3 !py-2 text-sm">
            <Activity size={16} /> <span className="hidden sm:inline">Matches</span>
          </Link>
          <Link href="/insights" className="btn btn-ghost !px-3 !py-2 text-sm">
            <BarChart3 size={16} /> <span className="hidden sm:inline">Insights</span>
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
