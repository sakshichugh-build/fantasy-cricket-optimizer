import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Fantasy Cricket Match Day Optimizer · live data +{" "}
          <span className="text-accent">Gemini Flash</span> reasoning
        </p>
        <nav className="flex items-center gap-4">
          <Link href="/components-map" className="hover:text-text">
            Components Map
          </Link>
          <a
            href="https://github.com/sakshichugh-build/fantasy-cricket-optimizer"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
