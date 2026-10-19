import { chromium, type Browser, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type {
  Observation,
  Settings,
  Report,
  ScanPhase,
} from "../../contracts/src/index.js";
import { redactUrl } from "../../contracts/src/index.js";
import { NetworkPolicy, SecurityError, safeCause } from "./security.js";
import { createEgressProxy } from "./proxy.js";
import { sample } from "./sample.js";
import { evaluate, overall } from "./rules.js";
import {
  INSTRUMENT_SCRIPT,
  READ_SCRIPT,
  type PageBuffers,
} from "./instrument.js";
import {
  analyze,
  type RawDiagnostics,
  type RawRequest,
} from "./diagnostics.js";
export const ENGINE_VERSION = "2.0.0";
const MAX_REQUESTS = 500;
const URL_IN_TEXT = /https?:\/\/[^\s)'"]+/;
/** Resolves to the fallback when the promise does not settle in time. */
const within = <T>(promise: Promise<T>, ms: number, fallback: T) =>
  Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
const MAX_ANALYSIS_FAILURES = 3;
const PRIVATE_MASK = "input, textarea, [contenteditable], [data-private]";
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** Optional live-progress hooks; none of them affects the evaluation. */
export interface ScanProgressHooks {
  /** Called when a stage of the scan starts. */
  phase?: (phase: ScanPhase) => void;
  /** Where to write a masked live preview of the page, taken once content appears. */
  previewFile?: string;
  /** Called after the live preview has been written. */
  preview?: () => void;
}
export async function scanPage(
  url: string,
  settings: Settings,
  expectedActive: boolean,
  evidenceFile: string,
  policy = new NetworkPolicy(),
  progress: ScanProgressHooks = {},
): Promise<Report> {
  const phase = (value: ScanPhase) => {
    try {
      progress.phase?.(value);
    } catch {
      /* progress reporting must never affect the scan */
    }
  };
  const start = performance.now(),
    elapsed = () => Math.round(performance.now() - start);
  const o: Observation = {
    httpStatus: null,
    finalUrl: redactUrl(url),
    redirects: [],
    navigationMs: null,
    domContentLoadedMs: null,
    usableMs: null,
    totalMs: 0,
    navigationError: null,
    environmentError: null,
    securityBlocked: false,
    blockedRequests: 0,
    redirectError: null,
    samples: [],
    screenshot: false,
    selectorError: null,
    analysisError: null,
  };
  let navStart = 0,
    navEpoch = 0;
  const raw: RawDiagnostics = {
    pageUrl: url,
    requests: [],
    console: [],
    pageErrors: [],
    invalidJson: [],
    buffers: null,
    settleMs: 0,
  };
  const pending = new Set<Promise<unknown>>();
  const track = (p: Promise<unknown>) => {
    pending.add(p);
    void p.finally(() => pending.delete(p));
  };
  const navElapsed = () => Math.round(performance.now() - navStart);
  const blockedOrigins = new Set<string>();
  let browser: Browser | undefined,
    context: BrowserContext | undefined,
    proxy: Awaited<ReturnType<typeof createEgressProxy>> | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    expired = false;
  const operation = async () => {
    try {
      phase("PREPARING");
      await policy.resolve(url);
      if (expired) return;
      proxy = await createEgressProxy(
        policy,
        (target, isDocument) => {
          o.blockedRequests++;
          if (target) {
            try {
              blockedOrigins.add(new URL(target).origin);
            } catch {}
          }
          if (isDocument) o.securityBlocked = true;
        },
        (target, cause) => {
          if (
            o.httpStatus === null &&
            new URL(target).hostname === new URL(url).hostname
          )
            o.navigationError ??= cause;
        },
      );
      if (expired) {
        await proxy.close();
        return;
      }
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.STOREGUARD_CHROMIUM_PATH || undefined,
        proxy: { server: proxy.server, bypass: "<-loopback>" },
        args: [
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        ],
        timeout: Math.max(
          1,
          Math.min(15000, settings.globalTimeoutMs - elapsed()),
        ),
      });
      if (expired) {
        await browser.close();
        return;
      }
      context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        serviceWorkers: "block",
        acceptDownloads: false,
        ignoreHTTPSErrors: false,
      });
      if (expired) {
        await context.close();
        await browser.close();
        return;
      }
      await context.addInitScript({ content: INSTRUMENT_SCRIPT });
      await context.routeWebSocket(/.*/, (socket) => {
        o.blockedRequests++;
        socket.close();
      });
      const page = await context.newPage();
      /* One visit feeds every diagnostic: errors, console, network and timing. */
      page.on("pageerror", (error) => {
        if (raw.pageErrors.length >= 100) return;
        raw.pageErrors.push({
          t: navStart ? navElapsed() : 0,
          name: error.name || "Error",
          message: String(error.message).slice(0, 500),
          source: error.stack?.match(URL_IN_TEXT)?.[0] ?? null,
        });
      });
      page.on("console", (message) => {
        const type = message.type();
        if (
          (type !== "error" && type !== "warning") ||
          raw.console.length >= 200
        )
          return;
        raw.console.push({
          t: navStart ? navElapsed() : 0,
          type: type === "error" ? "error" : "warning",
          text: message.text().slice(0, 500),
          url: message.location()?.url || null,
        });
      });
      const record = (entry: RawRequest) => {
        if (
          raw.requests.length < MAX_REQUESTS &&
          !entry.url.startsWith("data:")
        )
          raw.requests.push(entry);
      };
      const timingOf = (request: import("playwright").Request) => {
        const t = request.timing();
        return {
          start: t.startTime > 0 && navEpoch ? t.startTime - navEpoch : null,
          duration: t.responseEnd >= 0 ? t.responseEnd : null,
        };
      };
      page.on("requestfinished", (request) =>
        track(
          within(request.response(), 2000, null).then((response) => {
            record({
              url: request.url(),
              type: request.resourceType(),
              method: request.method(),
              ...timingOf(request),
              status: response?.status() ?? null,
              failure: null,
              scannerBlocked:
                response?.headers()["x-storeguard-proxy-error"] === "blocked",
            });
          }),
        ),
      );
      // Chromium reports subresources answered with 4xx/5xx as aborted requests;
      // the HTTP status is only visible on the response event, so keep it here.
      const statusOf = new WeakMap<import("playwright").Request, number>();
      page.on("requestfailed", (request) => {
        const failure = request.failure()?.errorText ?? "failed";
        record({
          url: request.url(),
          type: request.resourceType(),
          method: request.method(),
          ...timingOf(request),
          status: statusOf.get(request) ?? null,
          failure,
          scannerBlocked: /ERR_BLOCKED_BY_CLIENT/.test(failure),
        });
      });
      page.on("response", (response) => {
        statusOf.set(response.request(), response.status());
        const type = response.request().resourceType();
        const length = Number(response.headers()["content-length"] ?? 0);
        if (
          (type !== "xhr" && type !== "fetch") ||
          response.status() < 200 ||
          response.status() >= 300 ||
          !/json/i.test(response.headers()["content-type"] ?? "") ||
          length > 512000 ||
          raw.invalidJson.length >= 20
        )
          return;
        track(
          within(response.text(), 2000, "").then((body) => {
            if (!body.trim() || body.length > 512000) return;
            try {
              JSON.parse(body);
            } catch {
              raw.invalidJson.push({
                url: response.url(),
                status: response.status(),
              });
            }
          }),
        );
      });
      let navRequests = 0;
      context.on("page", (popup) => {
        if (popup !== page) void popup.close();
      });
      await context.route("**/*", async (route) => {
        const request = route.request();
        try {
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          ) {
            navRequests++;
            if (navRequests > settings.maxRedirects + 1) {
              o.redirectError = "Numărul maxim de redirecturi a fost depășit.";
              await route.abort("blockedbyclient");
              return;
            }
          }
          if (!["GET", "HEAD"].includes(request.method())) {
            o.blockedRequests++;
            await route.abort("blockedbyclient");
            return;
          }
          await policy.resolve(request.url());
          await route.continue();
        } catch (error) {
          o.blockedRequests++;
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          ) {
            o.securityBlocked = error instanceof SecurityError;
            o.navigationError = safeCause(error);
          }
          await route.abort("blockedbyclient").catch(() => {});
        }
      });
      page.on("domcontentloaded", () => {
        if (o.domContentLoadedMs === null) o.domContentLoadedMs = navElapsed();
      });
      page.on("response", (response) => {
        if (
          response.request().isNavigationRequest() &&
          response.request().frame() === page.mainFrame()
        ) {
          if (blockedOrigins.has(new URL(response.url()).origin))
            o.securityBlocked = true;
          if (
            response.headers()["x-storeguard-proxy-error"] &&
            (o.navigationError || o.securityBlocked)
          ) {
            o.httpStatus = null;
            return;
          }
          o.httpStatus = response.status();
          o.finalUrl = redactUrl(response.url());
          if (o.redirects.length < 30)
            o.redirects.push({
              url: redactUrl(response.url()),
              status: response.status(),
            });
          if (
            o.redirects.filter((hop) => hop.status >= 300 && hop.status < 400)
              .length > settings.maxRedirects
          ) {
            o.redirectError = "Numărul maxim de redirecturi a fost depășit.";
            void page.close().catch(() => {});
          }
          if ([401, 403, 407, 429].includes(response.status()))
            o.environmentError = `Acces restricționat: HTTP ${response.status()}. Nu confirmă un defect al paginii de produs.`;
        }
      });
      page.on("requestfailed", (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame() &&
          blockedOrigins.has(new URL(request.url()).origin)
        )
          o.securityBlocked = true;
      });
      phase("NAVIGATING");
      navStart = performance.now();
      navEpoch = Date.now();
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: settings.navigationTimeoutMs,
        });
        o.navigationMs = navElapsed();
      } catch (error) {
        o.navigationMs = navElapsed();
        o.navigationError ??= safeCause(error);
        if (o.navigationError.includes("ERR_TOO_MANY_REDIRECTS"))
          o.redirectError = "Buclă de redirect detectată de Chromium.";
      }
      if (!o.navigationError && !expired) {
        phase("OBSERVING");
        const renderStart = navElapsed();
        let failures = 0;
        let previewTaken = !progress.previewFile;
        while (
          !expired &&
          navElapsed() - renderStart <= settings.renderTimeoutMs + 250
        ) {
          try {
            const current = await sample(page, settings, navElapsed());
            o.samples.push(current);
            failures = 0;
            o.analysisError = null;
            if (
              !previewTaken &&
              !current.blocked &&
              !o.securityBlocked &&
              !o.environmentError &&
              (current.textChars > 0 || current.mediaElements > 0)
            ) {
              previewTaken = true;
              try {
                await mkdir(path.dirname(progress.previewFile!), {
                  recursive: true,
                });
                await page.screenshot({
                  path: progress.previewFile,
                  type: "jpeg",
                  quality: 60,
                  fullPage: false,
                  timeout: 1500,
                  mask: [page.locator(PRIVATE_MASK), page.getByText(EMAIL)],
                  maskColor: "#e2e8f0",
                });
                progress.preview?.();
              } catch {
                /* live preview is optional; evaluation continues */
              }
            }
            const tail = o.samples.slice(-3);
            const stable =
              tail.length === 3 &&
              tail.every((s) => s.signature === current.signature) &&
              current.atMs - tail[0].atMs >= 450;
            const usable =
              current.productSignal &&
              !current.loaderBlocking &&
              !current.blocked &&
              !current.softError;
            if (usable && stable) {
              o.usableMs = tail[0].atMs;
              break;
            }
            if (current.blocked || (current.softError && stable)) break;
          } catch (error) {
            if (/selector|querySelector|not a valid/i.test(String(error))) {
              o.selectorError =
                "Selector CSS invalid. Corectează setările scannerului.";
              break;
            }
            // A JavaScript redirect can briefly replace the execution context.
            if (page.isClosed()) throw error;
            o.analysisError = safeCause(error);
            if (++failures >= MAX_ANALYSIS_FAILURES && !o.samples.length) break;
          }
          if (navElapsed() - renderStart >= settings.renderTimeoutMs) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      /* Keep observing briefly after the page is usable, for late errors and requests. */
      const settle = Math.max(
        0,
        Math.min(
          settings.settleMs ?? 3000,
          settings.globalTimeoutMs - elapsed() - 2500,
        ),
      );
      if (
        !o.navigationError &&
        !expired &&
        o.usableMs !== null &&
        !o.samples.at(-1)?.blocked &&
        settle > 0
      ) {
        await new Promise((resolve) => setTimeout(resolve, settle));
        raw.settleMs = settle;
      }
      if (!expired && !page.isClosed())
        raw.buffers = await within(
          page.evaluate(READ_SCRIPT) as Promise<PageBuffers>,
          1500,
          null,
        );
      await within(Promise.allSettled([...pending]), 2000, []);
      const actualUrl = page.url();
      if (actualUrl.startsWith("http")) o.finalUrl = redactUrl(actualUrl);
      o.totalMs = elapsed();
      phase("EVALUATING");
      const rules = evaluate(o, settings, expectedActive);
      if (
        rules.some((r) =>
          ["FAIL", "WARNING", "INCONCLUSIVE"].includes(r.status),
        ) &&
        !o.samples.at(-1)?.blocked &&
        !o.environmentError &&
        !o.securityBlocked &&
        !expired &&
        o.httpStatus !== null
      ) {
        try {
          phase("EVIDENCE");
          await mkdir(path.dirname(evidenceFile), { recursive: true });
          await page.screenshot({
            path: evidenceFile,
            fullPage: false,
            timeout: 2000,
            mask: [page.locator(PRIVATE_MASK), page.getByText(EMAIL)],
            maskColor: "#e2e8f0",
          });
          o.screenshot = true;
        } catch {
          /* screenshot unavailable; no fabricated evidence */
        }
      }
    } catch (error) {
      if (error instanceof SecurityError) {
        o.securityBlocked = true;
        o.environmentError = error.message;
      } else {
        const cause = safeCause(error);
        if (cause === "BROWSER_UNAVAILABLE")
          o.environmentError =
            "Chromium nu poate porni. Rulează pnpm browser:install și verifică dependențele sistemului.";
        else o.navigationError = cause;
      }
    }
  };
  try {
    await Promise.race([
      operation(),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          o.environmentError =
            "Timeout global al scanării; evaluarea a fost întreruptă.";
          resolve();
        }, settings.globalTimeoutMs);
      }),
    ]);
  } finally {
    expired = true;
    clearTimeout(timer);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await proxy?.close().catch(() => {});
    o.totalMs = elapsed();
  }
  const rules = evaluate(o, settings, expectedActive);
  return {
    observation: o,
    rules,
    engineVersion: ENGINE_VERSION,
    rulesVersion: "1.0.0",
    verdict: overall(rules),
    diagnostics: analyze(raw, o, rules, settings),
  };
}
