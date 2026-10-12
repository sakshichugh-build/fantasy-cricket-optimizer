// Render /components-map to docs/components-map.png (1920px) and a PDF via Playwright.
// Usage: node scripts/export-map.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const base = (process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const out = resolve(process.cwd(), "docs/components-map.png");
const outPdf = resolve(process.cwd(), "docs/components-map.pdf");
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2 });
await page.emulateMedia({ colorScheme: "light" });
await page.goto(`${base}/components-map`, { waitUntil: "networkidle" });
await page.waitForSelector("#components-map-export");
// Hide the sticky app chrome so it can't overlap the diagram in the capture.
await page.addStyleTag({ content: "header{display:none!important} main{padding-top:0!important}" });
await page.waitForTimeout(1400); // let dashed arrows measure + draw

const el = await page.$("#components-map-export");
await el.screenshot({ path: out });
console.log("Wrote", out);

// Full-page PDF of the diagram page (landscape, wide).
await page.pdf({ path: outPdf, printBackground: true, landscape: true, width: "1920px", height: "1300px" });
console.log("Wrote", outPdf);

await browser.close();
