import { test, expect } from "@playwright/test";
test("dashboard, setări, scanare reală blocată și raport terminal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Privire de ansamblu" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Setări scanare" }).click();
  await expect(page.getByLabel("Timeout navigare (ms)")).toHaveValue("15000");
  await page.getByRole("button", { name: "Salvează setările" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Setările au fost salvate.",
  );
  await page
    .getByRole("button", { name: "Scanare nouă", exact: true })
    .first()
    .click();
  await page
    .getByLabel("URL pagină de produs")
    .fill("http://127.0.0.1:59999/test?token=secret");
  await page
    .getByRole("button", { name: "Scanează pagina", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Rezultatele verificărilor" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Evaluare blocată", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator(".report-url")).not.toContainText("secret");
  await expect(page.locator(".rule-card")).toHaveCount(7);
  await page.reload();
  await expect(page.locator(".rule-card")).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Deschide meniul" }).click();
  await page
    .getByRole("button", { name: "Istoric scanări", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Istoric scanări" }),
  ).toBeVisible();
});
