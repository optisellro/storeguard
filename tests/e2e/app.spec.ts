import { test, expect, type Page } from "@playwright/test";

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

test("shell, setări, verificare reală blocată și raport pe înțeles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Prezentare generală" }),
  ).toBeVisible();
  await shot(page, "01-overview-empty");

  await page.getByRole("button", { name: "Setări", exact: true }).click();
  await expect(page.getByLabel("Timp maxim de răspuns al paginii")).toHaveValue(
    "15000",
  );
  await page.getByRole("button", { name: "Salvează setările" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Setările au fost salvate.",
  );
  await shot(page, "02-settings");

  await page.getByRole("button", { name: "Verificare nouă" }).first().click();
  await page
    .getByLabel("Adresa paginii de produs")
    .fill("http://127.0.0.1:59999/test?token=secret");
  await page
    .getByRole("button", { name: "Pornește verificarea", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verificări efectuate" }),
  ).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByRole("heading", { name: "Nu am putut verifica pagina" }),
  ).toBeVisible();
  await expect(page.locator(".report-url")).not.toContainText("secret");
  await expect(page.locator(".check-row")).toHaveCount(7);
  await shot(page, "03-report-blocked");
  await page.reload();
  await expect(page.locator(".check-row")).toHaveCount(7);

  await page
    .getByRole("button", { name: "Pagini de produs", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Disponibilitate pagini de produs" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Ce verificăm/ }).click();
  await expect(
    page.getByText("Viteza de afișare", { exact: true }),
  ).toBeVisible();
  await shot(page, "04-module-rules");

  await page.getByRole("button", { name: /Flux de comandă/ }).click();
  await expect(
    page.getByRole("heading", { name: "Modul în dezvoltare" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Restrânge meniul" }).click();
  await expect(page.locator(".sidebar.is-collapsed")).toBeVisible();
  await page.getByRole("button", { name: "Prezentare generală" }).click();
  await shot(page, "05-overview-collapsed");
  await page.getByRole("button", { name: "Extinde meniul" }).click();
  await expect(page.locator(".sidebar.is-collapsed")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Deschide meniul" }).click();
  await page
    .getByRole("button", { name: "Istoric verificări", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Istoric verificări" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, "06-mobile-history");
});
