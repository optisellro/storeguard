import { test, expect } from "@playwright/test";

// Optional check against a real public product page. Runs only when
// STOREGUARD_SCREENSHOT_URL is set; it never replaces the controlled fixture tests.
const target = process.env.STOREGUARD_SCREENSHOT_URL;

test.skip(!target, "STOREGUARD_SCREENSHOT_URL nu este setat");

test("diagnostic tehnic pe o pagină publică reală", async ({ page }) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const domain = new URL(target!).hostname.replace(/^www\./, "");
  await page.goto("/#/stores");
  await page.getByLabel("Numele magazinului").fill("Magazin real");
  await page.getByLabel("Domeniu").fill(domain);
  await page.getByRole("button", { name: "Creează magazinul" }).click();
  await page.getByLabel("Adresa paginii de produs").fill(target!);
  await page.getByRole("button", { name: "Pornește verificarea" }).click();
  // The scan may finish between two UI refreshes, so the preview is best-effort.
  const sawPreview = await page
    .locator(".browser-shot")
    .waitFor({ timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  if (sawPreview)
    await page.screenshot({
      path: "test-results/screens/10-scan-progress.png",
    });
  await expect(
    page.getByRole("tab", { name: "JavaScript și rețea" }),
  ).toBeVisible({ timeout: 90000 });
  const storeId = page.url().match(/\/s\/([0-9a-f-]{36})/)![1];
  const scans = await page.evaluate(
    (id) => fetch(`/api/stores/${id}/scans`).then((r) => r.json()),
    storeId,
  );
  const full = await page.evaluate(
    (id) => fetch(`/api/scans/${id}`).then((r) => r.json()),
    scans[0].id,
  );
  const d = full.report?.diagnostics;
  // Surfaced as a CI annotation so the real-page result is visible without logs.
  console.log(
    `::notice title=Pagina reala::preview=${sawPreview} verdict=${full.report?.verdict} findings=${d?.findings.length} ` +
      `features=${d?.features.map((f: { id: string; status: string }) => `${f.id}:${f.status}`).join(",")} ` +
      `lcp=${d?.metrics.lcp.value} cls=${d?.metrics.cls.value} fcp=${d?.metrics.fcp.value} ttfb=${d?.metrics.ttfb.value} ` +
      `requests=${d?.counts.requests} failed=${d?.counts.failedRequests} js=${d?.counts.jsErrors} thirdParties=${d?.thirdParties.length} ` +
      `titles=${d?.findings.map((f: { feature: string; title: string; count: number }) => `${f.feature}|${f.title}|x${f.count}`).join(" ; ")}`,
  );
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screens/11-diagnostic-overview.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "JavaScript și rețea" }).click();
  await page.screenshot({
    path: "test-results/screens/12-diagnostic-network.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Încărcare și performanță" }).click();
  await page.screenshot({
    path: "test-results/screens/13-diagnostic-performance.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "PDP – Pagina de produs" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screens/14-store-dashboard.png",
    fullPage: true,
  });
});
