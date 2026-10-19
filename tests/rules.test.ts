import { describe, it, expect } from "vitest";
import {
  defaults,
  settingsSchema,
  redactUrl,
  type Observation,
  type Sample,
} from "../packages/contracts/src/index.js";
import { evaluate, overall } from "../packages/pdp-availability/src/rules.js";
const sample: Sample = {
  atMs: 22000,
  readyState: "complete",
  textChars: 300,
  visibleElements: 5,
  mediaElements: 1,
  contentArea: 10000,
  loader: false,
  loaderBlocking: false,
  genericLoader: false,
  productSignal: true,
  cookieBanner: false,
  softError: false,
  blocked: null,
  complexVisual: false,
  signature: "a",
};
const base: Observation = {
  httpStatus: 200,
  finalUrl: "https://shop.example/product",
  redirects: [{ url: "https://shop.example/product", status: 200 }],
  navigationMs: 200,
  domContentLoadedMs: 190,
  usableMs: 800,
  totalMs: 900,
  navigationError: null,
  environmentError: null,
  securityBlocked: false,
  blockedRequests: 0,
  redirectError: null,
  samples: [sample],
  screenshot: false,
  selectorError: null,
};
function rule(
  id: string,
  patch: Partial<Observation> = {},
  active = false,
  settings = defaults,
) {
  return evaluate({ ...base, ...patch }, settings, active).find(
    (r) => r.id === id,
  )!;
}
describe("evaluarea regulilor", () => {
  it("PDP normal: toate regulile sunt PASS", () =>
    expect(
      evaluate(base, defaults, true).every((r) => r.status === "PASS"),
    ).toBe(true));
  it.each([500, 503, 599])(
    "HTTP %i confirmă indisponibilitatea",
    (httpStatus) =>
      expect(rule("OS-PDP-001", { httpStatus }).status).toBe("FAIL"),
  );
  it.each([
    "ENOTFOUND",
    "ECONNREFUSED",
    "net::ERR_CERT_AUTHORITY_INVALID",
    "NAVIGATION_TIMEOUT",
  ])("păstrează cauza %s", (navigationError) => {
    const r = rule("OS-PDP-001", { httpStatus: null, navigationError });
    expect(r.status).toBe("FAIL");
    expect(r.technical.navigationError).toBe(navigationError);
  });
  it.each([404, 410])("HTTP %i depinde de starea declarată", (httpStatus) => {
    expect(rule("OS-PDP-002", { httpStatus }, true).status).toBe("FAIL");
    expect(rule("OS-PDP-002", { httpStatus }).status).toBe("WARNING");
  });
  it("pagină albă necesită probe multiple și fereastra completă", () => {
    const s = {
      ...sample,
      productSignal: false,
      textChars: 0,
      visibleElements: 0,
      mediaElements: 0,
      contentArea: 0,
    };
    expect(
      rule("OS-PDP-003", { usableMs: null, samples: [s, s, s] }).status,
    ).toBe("FAIL");
    expect(rule("OS-PDP-003", { usableMs: null, samples: [s] }).status).toBe(
      "INCONCLUSIVE",
    );
  });
  it("canvas nu este declarat pagină albă", () =>
    expect(
      rule("OS-PDP-003", {
        samples: [
          {
            ...sample,
            textChars: 0,
            mediaElements: 0,
            visibleElements: 0,
            complexVisual: true,
            productSignal: false,
          },
        ],
      }).status,
    ).toBe("INCONCLUSIVE"));
  it("loader explicit persistent confirmă OS004, spinner generic nu", () => {
    const s = { ...sample, loader: true, productSignal: false, textChars: 10 };
    expect(
      rule("OS-PDP-004", { usableMs: null, samples: [s, s, s] }, false, {
        ...defaults,
        loaderSelector: ".loader",
      }).status,
    ).toBe("FAIL");
    expect(
      rule("OS-PDP-004", { usableMs: null, samples: [s, s, s] }).status,
    ).toBe("INCONCLUSIVE");
  });
  it("nu declară un spinner cu produs încărcare infinită", () =>
    expect(
      rule("OS-PDP-004", {
        samples: [{ ...sample, loader: true, genericLoader: true }],
      }).status,
    ).toBe("PASS"));
  it("normalizarea HTTP la HTTPS este permisă", () =>
    expect(
      rule("OS-PDP-006", {
        redirects: [
          { url: "http://shop.example/product", status: 301 },
          { url: base.finalUrl, status: 200 },
        ],
      }).status,
    ).toBe("PASS"));
  it("bucla și depășirea limitei sunt FAIL", () =>
    expect(rule("OS-PDP-006", { redirectError: "Buclă" }).status).toBe("FAIL"));
  it("destinația configurată diferită este FAIL", () =>
    expect(
      rule("OS-PDP-006", {}, false, {
        ...defaults,
        expectedDomain: "other.example",
      }).status,
    ).toBe("FAIL"));
  it("soft error contextual este FAIL", () =>
    expect(
      rule("OS-PDP-009", {
        samples: [{ ...sample, productSignal: false, softError: true }],
      }).status,
    ).toBe("FAIL"));
  it("încărcarea lentă este avertizare, momentul necunoscut e inconcludent", () => {
    expect(rule("OS-PDP-010", { usableMs: 9000 }).status).toBe("WARNING");
    expect(rule("OS-PDP-010", { usableMs: null }).status).toBe("INCONCLUSIVE");
  });
  it("barieră anti-bot: niciun FAIL sau PASS fals", () => {
    const rules = evaluate(
      { ...base, samples: [{ ...sample, blocked: "CAPTCHA" }] },
      defaults,
      true,
    );
    expect(rules.every((r) => r.status === "INCONCLUSIVE")).toBe(true);
    expect(overall(rules)).toBe("INCONCLUSIVE");
  });
  it("validează setări și elimină date sensibile din URL", () => {
    expect(
      settingsSchema.safeParse({ ...defaults, maxRedirects: 0 }).success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({ ...defaults, globalTimeoutMs: 1000 }).success,
    ).toBe(false);
    expect(
      redactUrl("https://user:pass@shop.example/product?token=SECRET#account"),
    ).toBe("https://shop.example/product");
  });
});
