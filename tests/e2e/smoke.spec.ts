import { test, expect } from "@playwright/test";

test("home renders the hero and match board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /submittable/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sync live matches/i })).toBeVisible();
});

test("components map renders the swimlane grid", async ({ page }) => {
  await page.goto("/components-map");
  await expect(page.getByText("Case 8 · Aryan / Match Day Optimizer — Components Map")).toBeVisible();
  await expect(page.getByText(/Optimizer picks/i)).toBeVisible();
  await expect(page.getByText(/Picks C & VC/i)).toBeVisible();
});

test("insights page renders", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: /self-improvement/i })).toBeVisible();
});

/**
 * Full flow: match → analyse → valid team.
 * Requires a match in the DB (run `npm run seed` / sync first) and the cricket +
 * Gemini keys configured. Skips gracefully when no match is available so the
 * smoke suite still passes on a cold database.
 */
test("match → analyse → valid team", async ({ page }) => {
  await page.goto("/");
  const firstMatch = page.locator('a[href^="/match/"]').first();
  const hasMatch = (await firstMatch.count()) > 0;
  test.skip(!hasMatch, "No match available — seed/sync the DB to run the full flow.");

  await firstMatch.click();
  await expect(page.getByRole("button", { name: /Analyse this match|Re-analyse/i })).toBeVisible();

  // If already analysed, the team is shown; otherwise analyse.
  const analyseBtn = page.getByRole("button", { name: /Analyse this match/i });
  if (await analyseBtn.isVisible().catch(() => false)) {
    await analyseBtn.click();
  }

  // Wait for the validity checklist to appear and show the team is valid.
  await expect(page.getByText("Validity checklist")).toBeVisible({ timeout: 70_000 });
  // No red "Fix the red checks" warning => valid team.
  await expect(page.getByText(/Fix the red checks/i)).toHaveCount(0);
  // Captaincy call present.
  await expect(page.getByText(/Captain · 2×/)).toBeVisible();
});
