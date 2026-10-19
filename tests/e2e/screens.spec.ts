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
  // The scan may finish between two UI refreshes, so the preview is best-effort here.
  const sawPreview = await page
    .locator(".browser-shot")
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (sawPreview)
    await page.screenshot({
      path: "test-results/screens/10-scan-progress.png",
    });
  await expect(
    page.getByRole("heading", { name: "Verificări efectuate" }),
  ).toBeVisible({
    timeout: 70000,
  });
  const scans = await page.evaluate(() =>
    fetch("/api/scans").then((r) => r.json()),
  );
  const o = scans[0]?.report?.observation;
  // Surfaced as a CI annotation so the real-page result is visible without logs.
  console.log(
    `::notice title=Pagina reala::preview=${sawPreview} verdict=${scans[0]?.report?.verdict} samples=${o?.samples?.length} usableMs=${o?.usableMs} http=${o?.httpStatus} analysisError=${o?.analysisError} rules=${scans[0]?.report?.rules?.map((r: { status: string }) => r.status).join(",")}`,
  );
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screens/11-report-real.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Audit PDP" }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screens/12-overview-data.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: /Pagini/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "test-results/screens/13-module-pages.png",
    fullPage: true,
  });
});
