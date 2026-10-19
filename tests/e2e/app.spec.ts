import { test, expect, type Page } from "@playwright/test";

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

test("magazine izolate, diagnostic tehnic pe o pagină și setări", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Magazine", exact: true }),
  ).toBeVisible();

  // Two separate environments.
  for (const [name, domain] of [
    ["Magazin Test", "127.0.0.1"],
    ["Alt magazin", "alt-magazin.ro"],
  ]) {
    await page.goto("/#/stores");
    await page.getByLabel("Numele magazinului").fill(name);
    await page.getByLabel("Domeniu").fill(domain);
    await page.getByRole("button", { name: "Creează magazinul" }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await shot(page, "01-store-empty");

  // A page of another domain is refused for this store.
  await page
    .getByLabel("Adresa paginii de produs")
    .fill("https://altceva.ro/produs");
  await page.getByRole("button", { name: "Pornește verificarea" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "nu aparține magazinului",
  );

  // Switch to the first store and check a page there.
  await page.getByRole("button", { name: "Alege magazinul" }).click();
  await page.getByRole("menuitem", { name: /Magazin Test/ }).click();
  await expect(
    page.getByRole("heading", { name: "Magazin Test", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Adresa paginii de produs")
    .fill("http://127.0.0.1:59999/test?token=secret");
  await page.getByRole("button", { name: "Pornește verificarea" }).click();
  await expect(
    page.getByRole("tab", { name: "JavaScript și rețea" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("heading", { name: "Nu am putut verifica pagina" }),
  ).toBeVisible();
  await expect(page.locator(".report-url")).not.toContainText("secret");
  await shot(page, "02-diagnostic-blocked");
  for (const name of [
    "Încărcare și performanță",
    "JavaScript și rețea",
    "Browsere și regresii",
    "Experiența utilizatorilor",
    "Erori și corelări",
  ]) {
    await page.getByRole("tab", { name }).click();
    await expect(
      page.getByRole("heading", { name: "Verificări din această secțiune" }),
    ).toBeVisible();
  }
  await page.getByRole("tab", { name: "Experiența utilizatorilor" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Necesită scriptul StoreGuard instalat în magazin",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Nu am putut verifica pagina" }),
  ).toBeVisible();

  // The other store has no scans: results never mix.
  await page.getByRole("button", { name: "Alege magazinul" }).click();
  await page.getByRole("menuitem", { name: /Alt magazin/ }).click();
  await expect(
    page.getByRole("heading", { name: "Adaugă prima pagină de produs" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Alege magazinul" }).click();
  await page.getByRole("menuitem", { name: /Magazin Test/ }).click();
  await page.getByRole("tab", { name: /Istoric/ }).click();
  await expect(page.locator(".table .row-link")).toHaveCount(1);

  // Settings.
  await page.getByRole("button", { name: "Setări scanare" }).click();
  await expect(page.getByLabel("Timp maxim de răspuns al paginii")).toHaveValue(
    "15000",
  );
  await page.getByRole("button", { name: "Salvează setările" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Setările au fost salvate.",
  );

  // Collapsible sidebar.
  await page.getByRole("button", { name: "Restrânge meniul" }).click();
  await expect(page.locator(".sidebar.is-collapsed")).toBeVisible();
  await page.getByRole("button", { name: "Extinde meniul" }).click();
  await expect(page.locator(".sidebar.is-collapsed")).toHaveCount(0);
});
