import { test, expect } from "@playwright/test";

// Optional visual check against a real public product page. Runs only when
// STOREGUARD_SCREENSHOT_URL is set; it never replaces the controlled fixture tests.
const target = process.env.STOREGUARD_SCREENSHOT_URL;

test.skip(!target, "STOREGUARD_SCREENSHOT_URL nu este setat");

test("capturi pe o pagină publică reală", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/new");
  await page.getByLabel("Adresa paginii de produs").fill(target!);
  await page
    .getByRole("button", { name: "Pornește verificarea", exact: true })
    .click();
  await expect(page.locator(".scan-live")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/screens/10-scan-progress.png" });
  await expect(
    page.getByRole("heading", { name: "Verificări efectuate" }),
  ).toBeVisible({
    timeout: 70000,
  });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screens/11-report-real.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Prezentare generală" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screens/12-overview-data.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Pagini de produs", exact: true })
    .first()
    .click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "test-results/screens/13-module-pages.png",
    fullPage: true,
  });
});
