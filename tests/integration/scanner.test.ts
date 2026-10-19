import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import https from "node:https";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fixtureServer } from "../fixtures/server.js";
import { NetworkPolicy } from "../../packages/pdp-availability/src/security.js";
import { scanPage } from "../../packages/pdp-availability/src/scanner.js";
import { defaults, type Settings } from "../../packages/contracts/src/index.js";
let fixture: Awaited<ReturnType<typeof fixtureServer>>, dir: string;
beforeAll(async () => {
  fixture = await fixtureServer();
  dir = await mkdtemp(path.join(os.tmpdir(), "storeguard-scan-"));
});
afterAll(async () => {
  await fixture.close();
  await rm(dir, { recursive: true, force: true });
});
const settings: Settings = {
  ...defaults,
  navigationTimeoutMs: 2000,
  renderTimeoutMs: 1300,
  globalTimeoutMs: 10000,
  slowThresholdMs: 5000,
  maxRedirects: 4,
};
const run = (route: string, patch: Partial<Settings> = {}, active = false) =>
  scanPage(
    fixture.origin + route,
    { ...settings, ...patch },
    active,
    path.join(dir, "capture.png"),
    new NetworkPolicy(fixture.origin),
  );
const status = (report: Awaited<ReturnType<typeof run>>, id: string) =>
  report.rules.find((r) => r.id === id)?.status;
describe("Chromium real · pagini controlate", () => {
  it("PDP normal: 7 PASS și timpi reali", async () => {
    const r = await run("/normal");
    expect(r.observation.environmentError).toBeNull();
    expect(r.rules.map((r) => r.status)).toEqual(Array(7).fill("PASS"));
    expect(r.observation.usableMs).toBeGreaterThan(0);
  });
  it("previzualizare live mascată, JPEG, scrisă o singură dată", async () => {
    const previewFile = path.join(dir, "preview.jpg");
    let calls = 0;
    const phases: string[] = [];
    const r = await scanPage(
      fixture.origin + "/normal",
      settings,
      false,
      path.join(dir, "capture-preview.png"),
      new NetworkPolicy(fixture.origin),
      { phase: (p) => phases.push(p), previewFile, preview: () => calls++ },
    );
    expect(r.rules.map((rule) => rule.status)).toEqual(Array(7).fill("PASS"));
    expect(calls).toBe(1);
    expect((await stat(previewFile)).size).toBeGreaterThan(100);
    expect(phases.slice(0, 3)).toEqual([
      "PREPARING",
      "NAVIGATING",
      "OBSERVING",
    ]);
  });
  it.each(["/500", "/503"])(
    "%s -> FAIL OS001 și captură accesibilă",
    async (route) => {
      const r = await run(route);
      expect(status(r, "OS-PDP-001")).toBe("FAIL");
      expect(r.observation.screenshot).toBe(true);
      expect((await stat(path.join(dir, "capture.png"))).size).toBeGreaterThan(
        100,
      );
    },
  );
  it("conexiune refuzată -> FAIL OS001", async () => {
    const unused = await fixtureServer();
    const origin = unused.origin;
    await unused.close();
    const r = await scanPage(
      origin,
      settings,
      false,
      path.join(dir, "refused.png"),
      new NetworkPolicy(origin),
    );
    expect(status(r, "OS-PDP-001")).toBe("FAIL");
    expect(r.observation.navigationError).toBeTruthy();
  });
  it("handshake TLS invalid -> cauză TLS specifică", async () => {
    const server = https.createServer({}, (_, res) => res.end("test"));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const r = await scanPage(
        origin,
        settings,
        false,
        path.join(dir, "tls.png"),
        new NetworkPolicy(origin),
      );
      expect(status(r, "OS-PDP-001")).toBe("FAIL");
      expect(r.observation.navigationError).toMatch(/SSL|TLS/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("404 activ -> FAIL; necunoscut -> WARNING", async () => {
    expect(status(await run("/404", {}, true), "OS-PDP-002")).toBe("FAIL");
    expect(status(await run("/404"), "OS-PDP-002")).toBe("WARNING");
  });
  it.each(["/blank", "/hidden"])(
    "%s -> pagină goală confirmată",
    async (route) =>
      expect(status(await run(route), "OS-PDP-003")).toBe("FAIL"),
  );
  it("loader explicit persistent -> FAIL OS004", async () =>
    expect(
      status(
        await run("/loader", { loaderSelector: ".product-loader" }),
        "OS-PDP-004",
      ),
    ).toBe("FAIL"));
  it("loader care acoperă produsul rămâne o blocare", async () =>
    expect(
      status(
        await run("/overlay", { loaderSelector: ".product-loader" }),
        "OS-PDP-004",
      ),
    ).toBe("FAIL"));
  it("spinner în prezența produsului nu este încărcare infinită", async () =>
    expect(
      status(
        await run("/spinner-product", { loaderSelector: ".spinner" }),
        "OS-PDP-004",
      ),
    ).toBe("PASS"));
  it("redirect normal -> PASS, lanț colectat", async () => {
    const r = await run("/redirect");
    expect(status(r, "OS-PDP-006")).toBe("PASS");
    expect(r.observation.redirects.map((r) => r.status)).toEqual([302, 200]);
  });
  it("buclă -> FAIL OS006", async () =>
    expect(status(await run("/loop"), "OS-PDP-006")).toBe("FAIL"));
  it("limita configurată a redirecturilor este aplicată", async () => {
    const r = await run("/loop", { maxRedirects: 2 });
    expect(r.observation.redirectError).toContain("maxim");
    expect(r.observation.redirects.length).toBeLessThanOrEqual(5);
  });
  it("timeout global întrerupe scanarea și eliberează resursele", async () => {
    const r = await run("/blank", {
      navigationTimeoutMs: 500,
      renderTimeoutMs: 1000,
      globalTimeoutMs: 1000,
    });
    expect(r.observation.environmentError).toContain("global");
    expect(r.observation.totalMs).toBeLessThan(3500);
    expect((await run("/normal")).verdict).toBe("PASS");
  });
  it("redirect către HTTP 500 -> FAIL OS006", async () =>
    expect(status(await run("/redirect-error"), "OS-PDP-006")).toBe("FAIL"));
  it("eroare configurată HTTP200 -> FAIL OS009", async () =>
    expect(
      status(
        await run("/soft", { errorSelector: ".fatal-error" }),
        "OS-PDP-009",
      ),
    ).toBe("FAIL"));
  it("cuvântul error în footer nu este soft error", async () =>
    expect(status(await run("/error-word"), "OS-PDP-009")).toBe("PASS"));
  it("SPA întârziată -> PASS OS003, avertizare de timp", async () => {
    const r = await run("/delay", {
      renderTimeoutMs: 2300,
      slowThresholdMs: 500,
    });
    expect(status(r, "OS-PDP-003")).toBe("PASS");
    expect(status(r, "OS-PDP-010")).toBe("WARNING");
    expect(r.observation.usableMs).toBeGreaterThan(600);
  });
  it("polling permanent se finalizează", async () => {
    const r = await run("/polling");
    expect(status(r, "OS-PDP-004")).toBe("PASS");
    expect(r.observation.totalMs).toBeLessThan(8000);
  });
  it("cookie banner nu provoacă FAIL", async () =>
    expect((await run("/cookie")).rules.some((r) => r.status === "FAIL")).toBe(
      false,
    ));
  it.each(["/captcha", "/auth", "/forbidden"])(
    "%s -> INCONCLUSIVE fără defect confirmat",
    async (route) => {
      const r = await run(route);
      expect(r.verdict).toBe("INCONCLUSIVE");
      expect(r.rules.some((r) => r.status === "FAIL")).toBe(false);
      expect(r.observation.screenshot).toBe(false);
    },
  );
  it("redirect către metadata este blocat", async () => {
    const r = await run("/private");
    expect(r.observation.securityBlocked).toBe(true);
    expect(r.verdict).toBe("INCONCLUSIVE");
  });
  it("resurse private și POST blocate fără a fi trimise", async () => {
    const r = await run("/secondary");
    expect(r.observation.blockedRequests).toBeGreaterThan(0);
    expect(fixture.hits).not.toContain("/submit");
  });
  it("timeout navigare finalizează cu diagnostic", async () => {
    const r = await run("/hang", { navigationTimeoutMs: 500 });
    expect(status(r, "OS-PDP-001")).toBe("FAIL");
    expect(r.observation.navigationError).toContain("TIMEOUT");
  });
  it("selector invalid -> inconcludent, nu PASS", async () => {
    const r = await run("/normal", { loaderSelector: "[" });
    expect(r.observation.selectorError).toBeTruthy();
    expect(status(r, "OS-PDP-004")).toBe("INCONCLUSIVE");
  });
});

describe("Diagnostic tehnic · o singură vizită, pagini controlate", () => {
  const diag = async (route: string) => {
    const r = await scanPage(
      fixture.origin + route,
      { ...settings, renderTimeoutMs: 2500, settleMs: 900 },
      true,
      path.join(dir, "diag.png"),
      new NetworkPolicy(fixture.origin),
    );
    return r.diagnostics!;
  };
  const feature = (d: Awaited<ReturnType<typeof diag>>, id: string) =>
    d.features.find((f) => f.id === id)!;

  it("pagină curată: nicio problemă, metrici măsurate, verificări sintetice fără probleme", async () => {
    const d = await diag("/normal");
    expect(d.findings).toEqual([]);
    for (const id of [
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "13",
      "16",
      "17",
      "18",
      "19",
    ])
      expect(feature(d, id).status).toBe("ok");
    expect(d.metrics.fcp.value).toBeGreaterThan(0);
    expect(d.metrics.lcp.value).toBeGreaterThan(0);
    expect(d.metrics.ttfb.value).not.toBeNull();
    expect(d.metrics.cls.value).not.toBeNull();
    expect(d.metrics.inp.value).toBeNull();
    expect(d.waterfall.some((w) => w.type === "document")).toBe(true);
    expect(feature(d, "24").status).toBe("unavailable");
    expect(feature(d, "21").status).toBe("not_run");
  });
  it.each([
    ["/js-error", "06"],
    ["/rejection", "07"],
    ["/console-error", "08"],
    ["/api-fail", "09"],
    ["/bad-json", "10"],
    ["/missing-assets", "11"],
    ["/long-task", "14"],
    ["/hydration", "16"],
    ["/csp", "17"],
    ["/storm", "18"],
  ])("%s → problemă detectată la funcționalitatea %s", async (route, id) => {
    const d = await diag(route);
    const found = d.findings.filter((f) => f.feature === id);
    expect(found.length).toBeGreaterThan(0);
    expect(["fail", "warn"]).toContain(feature(d, id).status);
    for (const f of found) {
      expect(f.summary.length).toBeGreaterThan(20);
      expect(f.action.length).toBeGreaterThan(10);
    }
  });
  it("serviciu propriu căzut (503) este problemă confirmată, nu doar avertizare", async () => {
    const d = await diag("/api-fail");
    expect(d.findings.find((f) => f.feature === "09")?.severity).toBe(
      "problem",
    );
  });
  it("script și stil lipsă sunt grupate separat, fiecare o singură dată", async () => {
    const d = await diag("/missing-assets");
    expect(d.findings.filter((f) => f.feature === "11")).toHaveLength(2);
  });
  it("pagină blocată (CAPTCHA): verificările tehnice sunt inconcludente, fără probleme inventate", async () => {
    const d = await diag("/captcha");
    expect(d.findings).toEqual([]);
    expect(feature(d, "06").status).toBe("unknown");
  });
  it("pagină cu eroare de server: diagnosticul tehnic nu se aplică", async () => {
    const d = await diag("/500");
    expect(d.findings).toEqual([]);
    expect(feature(d, "06").status).toBe("not_run");
  });
});
