import { test, expect, type Page } from "@playwright/test";

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

test("Audit PDP: tab-uri, setări, verificare blocată și raport pe înțeles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Audit PDP" })).toBeVisible();
  await expect(page.locator(".side-nav .nav")).toHaveCount(1);
  await shot(page, "01-pdp-empty");

  await page.getByRole("tab", { name: "Setări" }).click();
  await expect(page.getByLabel("Timp maxim de răspuns al paginii")).toHaveValue(
    "15000",
  );
  await page.getByRole("button", { name: "Salvează setările" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Setările au fost salvate.",
  );

  await page.getByRole("button", { name: "Verificare nouă" }).first().click();
  await page
    .getByLabel("Adresa paginii de produs")
    .fill("http://127.0.0.1:59999/test?token=secret");
  await page
    .getByRole("button", { name: "Pornește verificarea", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verificări efectuate" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("heading", { name: "Nu am putut verifica pagina" }),
  ).toBeVisible();
  await expect(page.locator(".report-url")).not.toContainText("secret");
  await expect(page.locator(".check-row")).toHaveCount(7);
  await shot(page, "02-report-blocked");
  await page.reload();
  await expect(page.locator(".check-row")).toHaveCount(7);

  await page.getByRole("button", { name: "Audit PDP" }).first().click();
  await page.getByRole("tab", { name: /Istoric/ }).click();
  await expect(page.locator(".table .row-link")).toHaveCount(1);
  await page.getByRole("tab", { name: "Ce verificăm" }).click();
  await expect(
    page.getByText("Viteza de afișare", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Restrânge meniul" }).click();
  await expect(page.locator(".sidebar.is-collapsed")).toBeVisible();
  await page.getByRole("tab", { name: "Prezentare" }).click();
  await shot(page, "03-pdp-overview-collapsed");
  await page.getByRole("button", { name: "Extinde meniul" }).click();
  await expect(page.locator(".sidebar.is-collapsed")).toHaveCount(0);
});
