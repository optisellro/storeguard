import { describe, it, expect } from "vitest";
import {
  analyze,
  classifyRepeats,
  categoryOf,
  normalize,
  rate,
  type RawDiagnostics,
  type RawRequest,
} from "../packages/pdp-availability/src/diagnostics.js";
import { evaluate } from "../packages/pdp-availability/src/rules.js";
import {
  defaults,
  pdpFeatures,
  vitalThresholds,
  type Observation,
} from "../packages/contracts/src/index.js";

const sample = {
  atMs: 900,
  readyState: "complete",
  textChars: 900,
  visibleElements: 60,
  mediaElements: 3,
  contentArea: 500000,
  loader: false,
  loaderBlocking: false,
  genericLoader: false,
  productSignal: true,
  cookieBanner: false,
  softError: false,
  blocked: null,
  complexVisual: false,
  signature: "x",
};
const observation = (patch: Partial<Observation> = {}): Observation => ({
  httpStatus: 200,
  finalUrl: "https://www.magazin.ro/produs",
  redirects: [],
  navigationMs: 400,
  domContentLoadedMs: 400,
  usableMs: 900,
  totalMs: 3000,
  navigationError: null,
  environmentError: null,
  securityBlocked: false,
  blockedRequests: 0,
  redirectError: null,
  samples: [sample, { ...sample, atMs: 1200 }, { ...sample, atMs: 1500 }],
  screenshot: false,
  selectorError: null,
  analysisError: null,
  ...patch,
});
const request = (patch: Partial<RawRequest>): RawRequest => ({
  url: "https://www.magazin.ro/app.js",
  type: "script",
  method: "GET",
  start: 100,
  duration: 50,
  status: 200,
  failure: null,
  scannerBlocked: false,
  ...patch,
});
const raw = (patch: Partial<RawDiagnostics> = {}): RawDiagnostics => ({
  pageUrl: "https://www.magazin.ro/produs",
  requests: [],
  console: [],
  pageErrors: [],
  invalidJson: [],
  buffers: {
    instrumented: true,
    rejections: [],
    csp: [],
    longTasks: [],
    lcp: 1200,
    lcpTag: "img",
    fcp: 600,
    cls: 0.01,
    swRegistrations: 0,
    nav: { ttfb: 200, dcl: 500, load: 1100 },
    blocking: [],
  },
  settleMs: 1000,
  ...patch,
});
const run = (r: RawDiagnostics, o = observation()) =>
  analyze(r, o, evaluate(o, defaults, true), defaults);

describe("Diagnostic tehnic · analiză", () => {
  it("registrul conține exact cele 32 de funcționalități, în ordine", () => {
    expect(pdpFeatures.map((f) => f.id)).toEqual(
      Array.from({ length: 32 }, (_, i) => String(i + 1).padStart(2, "0")),
    );
    expect(run(raw()).features).toHaveLength(32);
  });
  it("pragurile oficiale Web Vitals", () => {
    expect(rate(2500, vitalThresholds.lcp)).toBe("good");
    expect(rate(3200, vitalThresholds.lcp)).toBe("ni");
    expect(rate(4100, vitalThresholds.lcp)).toBe("poor");
    expect(rate(0.3, vitalThresholds.cls)).toBe("poor");
    expect(rate(null, vitalThresholds.fcp)).toBeNull();
  });
  it("LCP foarte lent devine problemă explicată în limbaj simplu", () => {
    const d = run(raw({ buffers: { ...raw().buffers!, lcp: 6200 } }));
    const f = d.findings.find((x) => x.feature === "04")!;
    expect(f.severity).toBe("problem");
    expect(f.summary).toContain("6,2 secunde");
    expect(d.features.find((x) => x.id === "04")!.status).toBe("fail");
  });
  it("cererile oprite chiar de scanner nu sunt raportate ca erori ale magazinului", () => {
    const d = run(
      raw({
        requests: [
          request({
            type: "fetch",
            method: "POST",
            url: "https://www.magazin.ro/api/cart",
            status: null,
            failure: "net::ERR_BLOCKED_BY_CLIENT",
            scannerBlocked: true,
          }),
          request({
            type: "fetch",
            url: "https://www.magazin.ro/api/x",
            status: 403,
            scannerBlocked: true,
          }),
        ],
      }),
    );
    expect(d.findings).toEqual([]);
    expect(d.counts.requests).toBe(0);
  });
  it("răspunsuri 4xx așteptate (401/403/429) nu sunt raportate", () => {
    const d = run(
      raw({
        requests: [401, 403, 429].map((status) =>
          request({
            type: "xhr",
            url: `https://www.magazin.ro/api/${status}`,
            status,
          }),
        ),
      }),
    );
    expect(d.findings).toEqual([]);
  });
  it("script extern defect: avertizare marcată ca serviciu extern + serviciu extern cu erori", () => {
    const d = run(
      raw({
        requests: [
          request({ url: "https://widget.tawk.to/chat.js", status: 500 }),
        ],
      }),
    );
    const resource = d.findings.find((f) => f.feature === "11")!;
    expect(resource.severity).toBe("warning");
    expect(resource.thirdParty).toBe(true);
    expect(d.findings.some((f) => f.feature === "13")).toBe(true);
    expect(d.thirdParties[0]).toMatchObject({
      host: "widget.tawk.to",
      category: "Chat",
      failures: 1,
    });
  });
  it("subdomeniile magazinului nu sunt servicii externe", () => {
    const d = run(
      raw({ requests: [request({ url: "https://cdn.magazin.ro/app.js" })] }),
    );
    expect(d.thirdParties).toEqual([]);
  });
  it("aceeași eroare JS apărută de mai multe ori este o singură problemă, cu număr de apariții", () => {
    const e = {
      t: 100,
      name: "TypeError",
      message: "Cannot read properties of undefined (reading 'price')",
      source: "https://www.magazin.ro/app.js?v=12",
    };
    const d = run(
      raw({
        pageErrors: [
          e,
          { ...e, t: 300 },
          { ...e, t: 900, source: "https://www.magazin.ro/app.js?v=13" },
        ],
      }),
    );
    const f = d.findings.filter((x) => x.feature === "06");
    expect(f).toHaveLength(1);
    expect(f[0].count).toBe(3);
    expect(f[0].summary).not.toContain("TypeError");
  });
  it("eroare JS devine problemă confirmată doar dacă pagina este afectată vizibil", () => {
    const e = {
      t: 100,
      name: "TypeError",
      message: "x is undefined",
      source: null,
    };
    expect(run(raw({ pageErrors: [e] })).findings[0].severity).toBe("warning");
    const blank = observation({
      usableMs: null,
      samples: [0, 1, 2].map((i) => ({
        ...sample,
        atMs: 21000 + i * 250,
        textChars: 0,
        visibleElements: 0,
        mediaElements: 0,
        contentArea: 0,
        productSignal: false,
      })),
    });
    expect(
      run(raw({ pageErrors: [e] }), blank).findings.find(
        (f) => f.feature === "06",
      )?.severity,
    ).toBe("problem");
  });
  it("polling regulat nu este furtună de cereri; cererile în rafală sunt", () => {
    expect(
      classifyRepeats(Array.from({ length: 15 }, (_, i) => i * 1000)),
    ).toBe("polling");
    expect(classifyRepeats(Array.from({ length: 15 }, (_, i) => i * 20))).toBe(
      "storm",
    );
    expect(classifyRepeats([0, 10, 20])).toBe("normal");
  });
  it("probleme cu aceeași sursă sunt corelate", () => {
    const d = run(
      raw({
        requests: [
          request({ url: "https://cdn.vendor.com/a.js", status: 404 }),
          request({
            url: "https://cdn.vendor.com/b.css",
            type: "stylesheet",
            status: 404,
          }),
        ],
      }),
    );
    expect(d.correlations[0]).toMatchObject({ source: "cdn.vendor.com" });
    expect(d.features.find((f) => f.id === "30")!.status).toBe("warn");
  });
  it("cheile de grupare ignoră numere și parametri volatili", () => {
    expect(normalize("Error 123 at https://a.ro/x.js?v=9")).toBe(
      normalize("Error 456 at https://a.ro/x.js?v=10"),
    );
    expect(categoryOf("www.googletagmanager.com")).toBe("Analiză trafic");
  });
  it("fără date de instrumentare, metricile rămân nedeterminate, nu zero", () => {
    const d = run(raw({ buffers: null }));
    expect(d.metrics.lcp.value).toBeNull();
    expect(d.metrics.cls.value).toBeNull();
    expect(d.features.find((f) => f.id === "04")!.status).toBe("unknown");
  });
});
