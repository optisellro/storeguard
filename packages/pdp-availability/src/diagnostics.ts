import { getDomain } from "tldts";
import type {
  Correlation,
  Diagnostics,
  FeatureResult,
  FeatureStatus,
  Finding,
  MetricValue,
  Observation,
  Rating,
  RuleResult,
  Settings,
  ThirdParty,
  Verdict,
  WaterfallEntry,
} from "../../contracts/src/index.js";
import {
  pdpFeatures,
  redactUrl,
  vitalThresholds,
} from "../../contracts/src/index.js";
import type { PageBuffers } from "./instrument.js";

export const DIAGNOSTICS_VERSION = "2.0.0";

/* ---------- Raw collection produced by the scanner ---------- */
export interface RawRequest {
  url: string;
  type: string;
  method: string;
  /** ms from navigation start */
  start: number | null;
  duration: number | null;
  status: number | null;
  failure: string | null;
  /** Aborted or refused by StoreGuard's own safety policy, never the store's fault. */
  scannerBlocked: boolean;
}
export interface RawConsole {
  t: number;
  type: "error" | "warning";
  text: string;
  url: string | null;
}
export interface RawPageError {
  t: number;
  name: string;
  message: string;
  source: string | null;
}
export interface RawDiagnostics {
  pageUrl: string;
  requests: RawRequest[];
  console: RawConsole[];
  pageErrors: RawPageError[];
  invalidJson: { url: string; status: number }[];
  buffers: PageBuffers | null;
  settleMs: number;
}

/* ---------- Tunable detection thresholds ---------- */
export const detection = {
  slowRequestMs: 3000,
  renderBlockingMs: 1500,
  stormMinRequests: 12,
  pollingMaxPerSecond: 2,
  pollingMaxVariation: 0.3,
  totalBlockingWarnMs: 600,
  longTaskWarnMs: 500,
  thirdPartySlowMs: 2000,
};

/* ---------- Helpers ---------- */
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};
const siteOf = (host: string) =>
  getDomain(host, { allowPrivateDomains: true }) ?? host;
const pathOf = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
};
const fileOf = (url: string) => {
  const parts = pathOf(url).split("/").filter(Boolean);
  return parts.at(-1) ?? hostOf(url);
};
const secondsText = (ms: number) =>
  `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0).replace(".", ",")} secunde`;
/** Removes volatile parts so the same issue keeps the same key across scans. */
export const normalize = (text: string) =>
  text
    .replace(/https?:\/\/[^\s)'"]+/g, (u) => hostOf(u) + pathOf(u))
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 160);
const truncate = (text: string, n = 300) =>
  text.replace(/https?:\/\/[^\s)'"]+/g, (u) => redactUrl(u)).slice(0, n);

export function rate(
  value: number | null,
  [good, poor]: readonly [number, number],
): Rating | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value <= good ? "good" : value <= poor ? "ni" : "poor";
}
const ratingStatus = (r: Rating | null): FeatureStatus =>
  r === "good" ? "ok" : r === "ni" ? "warn" : r === "poor" ? "fail" : "unknown";
const verdictStatus = (v: Verdict | undefined): FeatureStatus =>
  v === "PASS"
    ? "ok"
    : v === "FAIL"
      ? "fail"
      : v === "WARNING"
        ? "warn"
        : v === "NOT_APPLICABLE"
          ? "not_run"
          : "unknown";
const statusOrder: FeatureStatus[] = [
  "fail",
  "warn",
  "unknown",
  "ok",
  "not_run",
  "unavailable",
];
export const worst = (...values: FeatureStatus[]): FeatureStatus =>
  values.length
    ? values.reduce((a, b) =>
        statusOrder.indexOf(a) <= statusOrder.indexOf(b) ? a : b,
      )
    : "unknown";

const HYDRATION =
  /hydrat|minified react error #(418|423|425)|text content does not match|did not match\. server|\[vue warn\].*hydration/i;
const CORS =
  /blocked by cors policy|cross-origin request blocked|access-control-allow-origin/i;
const MIXED = /mixed content/i;
const CSP =
  /content security policy|refused to (load|execute|apply|connect|frame)/i;
const SERVICE_WORKER = /service ?worker/i;
const SCANNER_NOISE = /ERR_BLOCKED_BY_CLIENT|failed to load resource/i;

const categories: [RegExp, string][] = [
  [
    /google-analytics|googletagmanager|analytics\.google|clarity\.ms|hotjar|mixpanel|segment\.(io|com)|plausible|matomo/,
    "Analiză trafic",
  ],
  [
    /facebook\.(net|com)|doubleclick|googleadservices|googlesyndication|tiktok|criteo|pinterest|snapchat|bat\.bing|linkedin|taboola|outbrain/,
    "Marketing și reclame",
  ],
  [
    /tawk\.to|smartsupp|intercom|crisp\.chat|zendesk|zopim|livechat|tidio|drift|messenger/,
    "Chat",
  ],
  [/trustpilot|judge\.me|yotpo|reviews|feefo|trusted/, "Recenzii"],
  [/stripe|paypal|netopia|mobilpay|klarna|tbi|payu/, "Plăți"],
  [
    /fonts\.googleapis|fonts\.gstatic|typekit|cdnjs|jsdelivr|unpkg|cloudflare|bootstrapcdn|jquery/,
    "CDN și fonturi",
  ],
  [/youtube|vimeo|ytimg/, "Video"],
  [/maps\.google|maps\.googleapis|mapbox/, "Hărți"],
];
export const categoryOf = (host: string) =>
  categories.find(([re]) => re.test(host))?.[1] ?? "Alte servicii";

/** Repeated calls to one endpoint: storm unless they are regular and slow enough to be polling. */
export function classifyRepeats(
  times: number[],
): "storm" | "polling" | "normal" {
  if (times.length < detection.stormMinRequests) return "normal";
  const sorted = [...times].sort((a, b) => a - b);
  const span = Math.max(1, sorted.at(-1)! - sorted[0]);
  const perSecond = (sorted.length - 1) / (span / 1000);
  const gaps = sorted.slice(1).map((t, i) => t - sorted[i]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const sd = Math.sqrt(
    gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length,
  );
  const variation = mean > 0 ? sd / mean : 1;
  return variation <= detection.pollingMaxVariation &&
    perSecond <= detection.pollingMaxPerSecond
    ? "polling"
    : "storm";
}

/* ---------- Analysis ---------- */
export function analyze(
  raw: RawDiagnostics,
  o: Observation,
  rules: RuleResult[],
  settings: Settings,
): Diagnostics {
  const pageHost = hostOf(raw.pageUrl);
  const pageSite = siteOf(pageHost);
  const isThird = (url: string) => {
    const h = hostOf(url);
    return !!h && siteOf(h) !== pageSite;
  };
  const ruleStatus = (id: string) =>
    verdictStatus(rules.find((r) => r.id === id)?.status);
  const last = o.samples.at(-1);
  const barrier = !!(o.environmentError || o.securityBlocked || last?.blocked);
  const reached =
    !barrier &&
    !o.navigationError &&
    o.httpStatus !== null &&
    o.httpStatus >= 200 &&
    o.httpStatus < 300;
  const impaired = ["OS-PDP-003", "OS-PDP-004", "OS-PDP-009"].some(
    (id) => ruleStatus(id) === "fail",
  );
  const b = raw.buffers;

  const findings = new Map<string, Finding>();
  const add = (f: Omit<Finding, "count"> & { count?: number }) => {
    const existing = findings.get(f.key);
    if (existing) {
      existing.count += f.count ?? 1;
      if (f.severity === "problem") existing.severity = "problem";
    } else findings.set(f.key, { ...f, count: f.count ?? 1 });
  };

  /* Requests: drop StoreGuard's own blocks and navigation cancellations. */
  const requests = raw.requests.filter((r) => !r.scannerBlocked);
  const realFailure = (r: RawRequest) =>
    !!r.failure && !/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(r.failure);
  const blockingSet = new Set(b?.blocking ?? []);
  const waterfall: WaterfallEntry[] = requests
    .filter((r) => r.start !== null)
    .sort((a, b2) => (a.start ?? 0) - (b2.start ?? 0))
    .slice(0, 150)
    .map((r) => ({
      url: redactUrl(r.url),
      host: hostOf(r.url),
      type: r.type,
      start: Math.max(0, Math.round(r.start ?? 0)),
      duration: r.duration === null ? null : Math.round(r.duration),
      status: r.status,
      failed: realFailure(r) ? r.failure : null,
      thirdParty: isThird(r.url),
      blocking: blockingSet.has(r.url),
    }));

  const byEndpoint = new Map<string, number[]>();
  if (reached) {
    /* 06 · JavaScript errors and 16 · hydration */
    // Browsers also surface unhandled rejections as page errors; count them once, under 07.
    const rejected = new Set((b?.rejections ?? []).map((r) => r.message));
    for (const e of raw.pageErrors) {
      if (rejected.has(e.message)) continue;
      const text = `${e.name}: ${e.message}`;
      const third = !!e.source && isThird(e.source);
      if (HYDRATION.test(text)) {
        add(hydration(text, e.t, e.source));
        continue;
      }
      add({
        key: `06:${normalize(text)}`,
        feature: "06",
        severity: impaired && !third ? "problem" : "warning",
        title: "Eroare JavaScript în pagină",
        summary: third
          ? `Un script al serviciului extern ${hostOf(e.source!)} a generat o eroare. Funcția oferită de acest serviciu poate să nu funcționeze.`
          : "A fost detectată o eroare JavaScript în pagina produsului. O componentă a paginii poate să nu funcționeze corect.",
        action: third
          ? "Verifică integrarea acestui serviciu sau contactează furnizorul lui."
          : "Trimite detaliile tehnice echipei care administrează tema și scripturile magazinului.",
        where: e.source ? `${fileOf(e.source)} · ${hostOf(e.source)}` : null,
        atMs: Math.round(e.t),
        thirdParty: third,
        source: e.source ? hostOf(e.source) : null,
        technical: {
          name: e.name,
          message: truncate(e.message),
          source: e.source ? redactUrl(e.source) : null,
        },
      });
    }
    /* 07 · unhandled rejections */
    for (const r of b?.rejections ?? []) {
      const src = r.stack?.match(/https?:\/\/[^\s)'"]+/)?.[0] ?? null;
      const third = !!src && isThird(src);
      add({
        key: `07:${normalize(`${r.name ?? ""} ${r.message}`)}`,
        feature: "07",
        severity: "warning",
        title: "Operațiune eșuată netratată",
        summary: third
          ? `O operațiune a serviciului extern ${hostOf(src!)} a eșuat, iar pagina nu a gestionat eroarea.`
          : "O operațiune din pagină a eșuat, iar pagina nu a gestionat eroarea. O funcție a paginii poate rămâne neterminată.",
        action:
          "Trimite detaliile tehnice echipei tehnice, pentru tratarea erorii în script.",
        where: src ? `${fileOf(src)} · ${hostOf(src)}` : null,
        atMs: Math.round(r.t),
        thirdParty: third,
        source: src ? hostOf(src) : null,
        technical: {
          name: r.name,
          message: truncate(r.message),
          stack: r.stack ? truncate(r.stack, 600) : null,
        },
      });
    }
    /* 08 · console, 16 · hydration, 17 · CORS/CSP/mixed, 19 · service worker */
    for (const c of raw.console) {
      if (c.type !== "error" || SCANNER_NOISE.test(c.text)) continue;
      const src = c.url || null;
      const third = !!src && isThird(src);
      if (HYDRATION.test(c.text)) {
        add(hydration(c.text, c.t, src));
        continue;
      }
      const security = CORS.test(c.text)
        ? "cors"
        : MIXED.test(c.text)
          ? "mixed"
          : CSP.test(c.text)
            ? "csp"
            : null;
      if (security) {
        add(securityFinding(security, c.text, c.t, isThird));
        continue;
      }
      if (SERVICE_WORKER.test(c.text)) {
        add({
          key: `19:${normalize(c.text)}`,
          feature: "19",
          severity: "warning",
          title: "Eroare de service worker",
          summary:
            "Componenta care gestionează cache-ul paginii a raportat o eroare. Unele resurse pot fi servite incorect.",
          action: "Verifică scriptul de service worker al magazinului.",
          where: src ? fileOf(src) : null,
          atMs: Math.round(c.t),
          thirdParty: third,
          source: src ? hostOf(src) : null,
          technical: { text: truncate(c.text) },
        });
        continue;
      }
      add({
        key: `08:${normalize(c.text)}`,
        feature: "08",
        severity: "warning",
        title: "Eroare raportată în consola browserului",
        summary: third
          ? `Serviciul extern ${hostOf(src!)} a raportat o eroare în browser.`
          : "Browserul a raportat o eroare tehnică în pagină. Nu blochează neapărat pagina, dar indică o funcție care nu se execută corect.",
        action: "Trimite detaliile tehnice echipei tehnice pentru verificare.",
        where: src ? `${fileOf(src)} · ${hostOf(src)}` : null,
        atMs: Math.round(c.t),
        thirdParty: third,
        source: src ? hostOf(src) : null,
        technical: { text: truncate(c.text), url: src ? redactUrl(src) : null },
      });
    }
    for (const v of b?.csp ?? [])
      add(
        securityFinding(
          "csp",
          `${v.directive} ${v.blocked}`,
          v.t,
          isThird,
          v.blocked,
        ),
      );

    /* 09 · API failures, 11 · resources */
    for (const r of requests) {
      const third = isThird(r.url);
      const where = `${hostOf(r.url)}${pathOf(r.url)}`;
      const technical = {
        url: redactUrl(r.url),
        status: r.status,
        failure: r.failure,
        type: r.type,
        method: r.method,
      };
      const at = r.start === null ? null : Math.round(r.start);
      const failed = realFailure(r);
      if (r.type === "xhr" || r.type === "fetch") {
        const server = (r.status ?? 0) >= 500;
        const missing = r.status === 404 || r.status === 410;
        if (!failed && !server && !missing) continue;
        add({
          key: `09:${r.method}:${normalize(where)}`,
          feature: "09",
          severity: !third && (server || failed) ? "problem" : "warning",
          title: missing
            ? "Serviciu al paginii inexistent"
            : "Serviciu al paginii care nu răspunde corect",
          summary: third
            ? `Serviciul extern ${hostOf(r.url)} nu a răspuns corect. Funcția oferită de el poate lipsi din pagină.`
            : missing
              ? "Pagina cere date de la o adresă care nu mai există. O informație sau o funcție poate lipsi."
              : "Un serviciu necesar paginii nu a răspuns corect. Unele informații sau funcționalități pot să nu se încarce.",
          action: third
            ? "Verifică integrarea serviciului extern sau contactează furnizorul."
            : "Verifică serverul magazinului și serviciul indicat; trimite detaliile tehnice echipei tehnice.",
          where,
          atMs: at,
          thirdParty: third,
          source: hostOf(r.url),
          technical,
        });
        continue;
      }
      if (
        ["script", "stylesheet", "font"].includes(r.type) &&
        (failed || (r.status ?? 0) >= 400)
      ) {
        const kind =
          r.type === "script"
            ? "Un script"
            : r.type === "stylesheet"
              ? "Un fișier de stil"
              : "Un font";
        add({
          key: `11:${normalize(where)}`,
          feature: "11",
          severity: !third && r.type !== "font" ? "problem" : "warning",
          title: "Fișier al paginii care nu se încarcă",
          summary: third
            ? `${kind} al serviciului extern ${hostOf(r.url)} nu s-a încărcat.`
            : `${kind} necesar paginii nu s-a încărcat${r.status ? ` (eroare ${r.status})` : ""}. ${r.type === "stylesheet" ? "Aspectul paginii poate fi afectat." : r.type === "font" ? "Textul poate apărea cu alt font." : "Unele funcții ale paginii pot lipsi."}`,
          action: third
            ? "Verifică integrarea serviciului extern."
            : "Verifică dacă fișierul există pe server și dacă tema magazinului îl referă corect.",
          where: `${fileOf(r.url)} · ${hostOf(r.url)}`,
          atMs: at,
          thirdParty: third,
          source: hostOf(r.url),
          technical,
        });
      }
    }
    /* 10 · invalid JSON */
    for (const j of raw.invalidJson) {
      const third = isThird(j.url);
      add({
        key: `10:${normalize(hostOf(j.url) + pathOf(j.url))}`,
        feature: "10",
        severity: third ? "warning" : "problem",
        title: "Date primite în format invalid",
        summary:
          "Un serviciu al paginii a trimis date într-un format pe care pagina nu îl poate citi. Componenta care le folosește poate să nu se afișeze.",
        action:
          "Verifică serviciul indicat; răspunsul declară date JSON, dar conținutul nu este valid.",
        where: `${hostOf(j.url)}${pathOf(j.url)}`,
        atMs: null,
        thirdParty: third,
        source: hostOf(j.url),
        technical: { url: redactUrl(j.url), status: j.status },
      });
    }
    /* 12 · slow requests and render-blocking files */
    const slow = waterfall.filter(
      (w) =>
        (w.duration ?? 0) > detection.slowRequestMs &&
        !["eventsource", "websocket", "media", "document"].includes(w.type),
    );
    if (slow.length)
      add({
        key: "12:slow",
        feature: "12",
        severity: "warning",
        title: "Cereri foarte lente",
        summary: `${slow.length === 1 ? "O cerere a durat" : `${slow.length} cereri au durat`} peste ${secondsText(detection.slowRequestMs)}. Elementele care depind de ele apar cu întârziere.`,
        action:
          "Verifică serviciile indicate; cele externe pot fi încărcate mai târziu sau înlocuite.",
        where: slow
          .slice(0, 3)
          .map((w) => `${fileOf(w.url)} · ${w.host}`)
          .join(", "),
        atMs: slow[0].start,
        thirdParty: slow.every((w) => w.thirdParty),
        source: slow[0].host,
        technical: {
          requests: slow
            .slice(0, 10)
            .map((w) => ({ url: w.url, durationMs: w.duration })),
        },
        count: slow.length,
      });
    const blocking = waterfall.filter((w) => w.blocking);
    const blockingMs = blocking.reduce((s, w) => s + (w.duration ?? 0), 0);
    if (blocking.length && blockingMs > detection.renderBlockingMs)
      add({
        key: "12:blocking",
        feature: "12",
        severity: "warning",
        title: "Fișiere care întârzie afișarea paginii",
        summary: `${blocking.length === 1 ? "Un fișier trebuie descărcat" : `${blocking.length} fișiere trebuie descărcate`} înainte ca pagina să poată fi afișată (în total ${secondsText(blockingMs)}).`,
        action:
          "Încarcă scripturile neesențiale după afișarea paginii și redu fișierele CSS din partea de sus a paginii.",
        where: blocking
          .slice(0, 3)
          .map((w) => `${fileOf(w.url)} · ${w.host}`)
          .join(", "),
        atMs: null,
        thirdParty: blocking.every((w) => w.thirdParty),
        source: blocking[0].host,
        technical: {
          files: blocking
            .slice(0, 10)
            .map((w) => ({ url: w.url, durationMs: w.duration })),
        },
        count: blocking.length,
      });
    /* 18 · request storms */
    for (const r of requests)
      if ((r.type === "xhr" || r.type === "fetch") && r.start !== null) {
        const k = `${r.method} ${hostOf(r.url)}${pathOf(r.url)}`;
        byEndpoint.set(k, [...(byEndpoint.get(k) ?? []), r.start]);
      }
    for (const [endpoint, times] of byEndpoint)
      if (classifyRepeats(times) === "storm")
        add({
          key: `18:${normalize(endpoint)}`,
          feature: "18",
          severity: "warning",
          title: "Cereri repetate excesiv",
          summary: `Pagina a trimis ${times.length} cereri către același serviciu într-un timp scurt. Poate fi o buclă care încarcă inutil browserul și serverul.`,
          action:
            "Verifică scriptul care apelează serviciul indicat (retry fără limită sau actualizări prea dese).",
          where: endpoint.replace(/^[A-Z]+ /, ""),
          atMs: Math.round(Math.min(...times)),
          thirdParty: isThird(`https://${endpoint.split(" ")[1]}`),
          source: endpoint.split(" ")[1].split("/")[0],
          technical: { endpoint, requests: times.length },
          count: times.length,
        });
    /* 03/04/05 · lab metrics */
    metricFinding("lcp", b?.lcp ?? null, add);
    metricFinding("cls", b?.cls ?? null, add);
    metricFinding("fcp", b?.fcp ?? null, add);
    metricFinding("ttfb", b?.nav?.ttfb ?? null, add);
    /* 14 · long tasks */
    const tasks = b?.longTasks ?? [];
    const tbt = tasks.reduce((s, t) => s + Math.max(0, t.d - 50), 0);
    const longest = tasks.reduce((m, t) => Math.max(m, t.d), 0);
    if (
      tbt > detection.totalBlockingWarnMs ||
      longest > detection.longTaskWarnMs
    ) {
      const src = tasks.find((t) => t.src)?.src ?? null;
      add({
        key: "14:blocking",
        feature: "14",
        severity: "warning",
        title: "Browserul blocat de scripturi",
        summary: `Un script a blocat temporar browserul (cea mai lungă blocare: ${Math.round(longest)} ms), ceea ce poate întârzia reacția paginii la click.`,
        action:
          "Verifică scripturile grele ale temei și serviciile externe; amână-le pe cele neesențiale.",
        where: src ? fileOf(src) : null,
        atMs: Math.round(tasks.find((t) => t.d === longest)?.t ?? 0),
        thirdParty: !!src && isThird(src),
        source: src ? hostOf(src) : null,
        technical: {
          totalBlockingMs: Math.round(tbt),
          longestMs: Math.round(longest),
          tasks: tasks.length,
        },
      });
    }
  }

  /* 13 · third parties */
  const tp = new Map<string, ThirdParty>();
  for (const r of requests) {
    if (!isThird(r.url)) continue;
    const h = hostOf(r.url);
    const entry = tp.get(h) ?? {
      host: h,
      category: categoryOf(h),
      requests: 0,
      failures: 0,
      slowestMs: null,
    };
    entry.requests++;
    if (realFailure(r) || (r.status ?? 0) >= 400) entry.failures++;
    if (r.duration !== null)
      entry.slowestMs = Math.max(entry.slowestMs ?? 0, Math.round(r.duration));
    tp.set(h, entry);
  }
  const thirdParties = [...tp.values()].sort(
    (a, b2) => b2.requests - a.requests,
  );
  if (reached)
    for (const t of thirdParties)
      if (t.failures || (t.slowestMs ?? 0) > detection.thirdPartySlowMs)
        add({
          key: `13:${t.host}`,
          feature: "13",
          severity: "warning",
          title: t.failures
            ? "Serviciu extern cu erori"
            : "Serviciu extern lent",
          summary: t.failures
            ? `Serviciul extern ${t.host} (${t.category.toLowerCase()}) nu s-a încărcat corect: ${t.failures} din ${t.requests} cereri au eșuat.`
            : `Serviciul extern ${t.host} (${t.category.toLowerCase()}) răspunde lent (până la ${secondsText(t.slowestMs ?? 0)}).`,
          action:
            "Verifică dacă serviciul este încă necesar și configurat corect; poate fi încărcat după afișarea paginii.",
          where: t.host,
          atMs: null,
          thirdParty: true,
          source: t.host,
          technical: { ...t },
        });

  const list = [...findings.values()].sort((a, b2) =>
    a.severity === b2.severity
      ? b2.count - a.count
      : a.severity === "problem"
        ? -1
        : 1,
  );

  /* 30 · correlation by source */
  const bySource = new Map<string, Correlation>();
  for (const f of list) {
    if (!f.source) continue;
    const c = bySource.get(f.source) ?? {
      source: f.source,
      count: 0,
      features: [],
    };
    c.count++;
    if (!c.features.includes(f.feature)) c.features.push(f.feature);
    bySource.set(f.source, c);
  }
  const correlations = [...bySource.values()]
    .filter((c) => c.count >= 2)
    .sort((a, b2) => b2.count - a.count);

  /* Metrics */
  const metric = (
    key: keyof typeof vitalThresholds,
    value: number | null,
  ): MetricValue => ({
    value:
      value === null
        ? null
        : key === "cls"
          ? Math.round(value * 1000) / 1000
          : Math.round(value),
    rating: rate(value, vitalThresholds[key]),
  });
  const tasks = b?.longTasks ?? [];
  const metrics: Diagnostics["metrics"] = {
    ttfb: metric("ttfb", reached ? (b?.nav?.ttfb ?? null) : null),
    fcp: metric("fcp", reached ? (b?.fcp ?? null) : null),
    lcp: metric("lcp", reached ? (b?.lcp ?? null) : null),
    cls: metric("cls", reached && b?.instrumented ? (b.cls ?? 0) : null),
    inp: { value: null, rating: null },
    domContentLoadedMs:
      reached && b?.nav?.dcl != null ? Math.round(b.nav.dcl) : null,
    loadMs: reached && b?.nav?.load != null ? Math.round(b.nav.load) : null,
    usableMs: o.usableMs,
    totalBlockingMs:
      reached && b
        ? Math.round(tasks.reduce((s, t) => s + Math.max(0, t.d - 50), 0))
        : null,
    longestTaskMs:
      reached && b
        ? Math.round(tasks.reduce((m, t) => Math.max(m, t.d), 0))
        : null,
  };

  /* Feature results */
  const byFeature = (id: string) => list.filter((f) => f.feature === id);
  const fromFindings = (id: string, ok: string): FeatureResult => {
    const fs = byFeature(id);
    return fs.length
      ? {
          id,
          status: fs.some((f) => f.severity === "problem") ? "fail" : "warn",
          summary:
            fs.length === 1
              ? fs[0].summary
              : `${fs.length} probleme detectate.`,
        }
      : { id, status: "ok", summary: ok };
  };
  const notReached: FeatureResult["summary"] = barrier
    ? "Nu am putut verifica: accesul la pagină a fost restricționat."
    : "Nu se aplică, deoarece pagina nu s-a deschis normal.";
  const unreachedStatus: FeatureStatus = barrier ? "unknown" : "not_run";
  const synthetic = (
    id: string,
    compute: () => FeatureResult,
  ): FeatureResult =>
    reached ? compute() : { id, status: unreachedStatus, summary: notReached };
  const s = (ms: number | null) =>
    ms === null ? "—" : secondsText(ms).replace(" secunde", " s");

  const features: FeatureResult[] = pdpFeatures.map((def): FeatureResult => {
    const id = def.id;
    switch (id) {
      case "01": {
        const st = worst(
          ...["OS-PDP-001", "OS-PDP-002", "OS-PDP-006", "OS-PDP-009"]
            .map(ruleStatus)
            .filter((x) => x !== "not_run"),
        );
        return {
          id,
          status: st,
          summary:
            st === "ok"
              ? "Pagina răspunde normal."
              : st === "unknown"
                ? "Disponibilitatea nu a putut fi confirmată."
                : "A fost găsită o problemă de disponibilitate.",
        };
      }
      case "02": {
        const st = worst(...["OS-PDP-003", "OS-PDP-004"].map(ruleStatus));
        return {
          id,
          status: st,
          summary:
            st === "ok"
              ? "Pagina se afișează complet."
              : st === "not_run"
                ? notReached
                : st === "unknown"
                  ? "Afișarea completă nu a putut fi confirmată."
                  : "Pagina nu se afișează complet.",
        };
      }
      case "03":
        return synthetic(id, () => ({
          id,
          status: worst(
            ratingStatus(metrics.ttfb.rating),
            ruleStatus("OS-PDP-010"),
          ),
          summary: `Server ${s(metrics.ttfb.value)} · structură ${s(metrics.domContentLoadedMs)} · încărcare completă ${metrics.loadMs === null ? "neterminată în fereastra observată" : s(metrics.loadMs)}.`,
        }));
      case "04":
        return synthetic(id, () => ({
          id,
          status: worst(
            ratingStatus(metrics.lcp.rating),
            ratingStatus(metrics.cls.rating),
          ),
          summary: `Conținut principal ${s(metrics.lcp.value)} · stabilitate ${metrics.cls.value === null ? "—" : String(metrics.cls.value).replace(".", ",")}. Reacția la click (INP) se măsoară doar cu vizitatori reali.`,
        }));
      case "05":
        return synthetic(id, () => ({
          id,
          status: ratingStatus(metrics.fcp.rating),
          summary: `Primul conținut apare după ${s(metrics.fcp.value)}.`,
        }));
      case "06":
        return synthetic(id, () =>
          fromFindings(id, "Nu au fost detectate erori JavaScript."),
        );
      case "07":
        return synthetic(id, () =>
          fromFindings(id, "Nu au fost detectate operațiuni eșuate netratate."),
        );
      case "08":
        return synthetic(id, () =>
          fromFindings(id, "Nu au fost detectate erori relevante în consolă."),
        );
      case "09":
        return synthetic(id, () =>
          fromFindings(id, "Serviciile de date ale paginii au răspuns corect."),
        );
      case "10":
        return synthetic(id, () =>
          fromFindings(id, "Datele primite au avut un format valid."),
        );
      case "11":
        return synthetic(id, () =>
          fromFindings(
            id,
            "Scripturile, stilurile și fonturile s-au încărcat.",
          ),
        );
      case "12":
        return synthetic(id, () =>
          fromFindings(
            id,
            `${requests.length} cereri analizate, fără cereri foarte lente.`,
          ),
        );
      case "13":
        return synthetic(id, () =>
          thirdParties.length
            ? fromFindings(
                id,
                `${thirdParties.length} servicii externe, fără erori sau întârzieri mari.`,
              )
            : {
                id,
                status: "ok",
                summary: "Pagina nu încarcă servicii externe.",
              },
        );
      case "14":
        return synthetic(id, () =>
          fromFindings(
            id,
            tasks.length
              ? `Blocări scurte, sub pragul de atenție.`
              : "Browserul nu a fost blocat de scripturi.",
          ),
        );
      case "16":
        return synthetic(id, () =>
          fromFindings(
            id,
            "Nu au fost detectate erori de inițializare a aplicației.",
          ),
        );
      case "17":
        return synthetic(id, () =>
          fromFindings(
            id,
            "Nu au fost detectate resurse blocate de reguli de securitate.",
          ),
        );
      case "18":
        return synthetic(id, () => {
          const r = fromFindings(
            id,
            "Nu au fost detectate cereri repetate excesiv.",
          );
          const polling = [...byEndpoint.values()].some(
            (t) => classifyRepeats(t) === "polling",
          );
          return r.status === "ok" && polling
            ? {
                ...r,
                summary:
                  "Actualizări periodice regulate (polling), fără cereri excesive.",
              }
            : r;
        });
      case "19":
        return synthetic(id, () => {
          const r = fromFindings(
            id,
            "Nu au fost detectate erori de service worker.",
          );
          return r.status === "ok" && (b?.swRegistrations ?? 0) > 0
            ? {
                ...r,
                summary:
                  "Magazinul folosește un service worker. Comportamentul din cache nu este testat în această scanare.",
              }
            : r;
        });
      case "30":
        return synthetic(id, () =>
          correlations.length
            ? {
                id,
                status: "warn",
                summary: `${correlations[0].count} probleme au aceeași sursă: ${correlations[0].source}.`,
              }
            : {
                id,
                status: "ok",
                summary: "Problemele găsite nu au o sursă comună.",
              },
        );
      default:
        return {
          id,
          status: def.availability === "sdk" ? "unavailable" : "not_run",
          summary:
            def.availability === "sdk"
              ? "Necesită scriptul StoreGuard instalat în magazin."
              : def.availability === "history"
                ? "Comparația între scanări va fi activată în etapa următoare."
                : "Necesită o scanare suplimentară, disponibilă în etapa următoare.",
        };
    }
  });

  return {
    version: DIAGNOSTICS_VERSION,
    metrics,
    findings: list,
    waterfall,
    thirdParties,
    correlations,
    features,
    counts: {
      requests: requests.length,
      failedRequests: requests.filter(
        (r) => realFailure(r) || (r.status ?? 0) >= 400,
      ).length,
      jsErrors: raw.pageErrors.length,
      consoleErrors: raw.console.filter((c) => c.type === "error").length,
      consoleWarnings: raw.console.filter((c) => c.type === "warning").length,
      longTasks: tasks.length,
    },
    settleMs: raw.settleMs,
  };
}

function hydration(
  text: string,
  t: number,
  source: string | null,
): Omit<Finding, "count"> {
  return {
    key: `16:${normalize(text).slice(0, 80)}`,
    feature: "16",
    severity: "warning",
    title: "Inițializare cu erori a paginii",
    summary:
      "Componentele interactive ale paginii s-au inițializat cu erori. Unele butoane sau secțiuni pot să nu reacționeze corect.",
    action:
      "Trimite detaliile tehnice echipei care dezvoltă tema sau aplicația magazinului.",
    where: source ? fileOf(source) : null,
    atMs: Math.round(t),
    thirdParty: false,
    source: source ? hostOf(source) : null,
    technical: { text: truncate(text) },
  };
}

function securityFinding(
  kind: "cors" | "csp" | "mixed",
  text: string,
  t: number,
  isThird: (url: string) => boolean,
  url?: string,
): Omit<Finding, "count"> {
  const target = url || text.match(/https?:\/\/[^\s)'"]+/)?.[0] || null;
  const copy = {
    cors: [
      "Resursă blocată de regulile între domenii (CORS)",
      "Browserul a blocat datele cerute de la un alt domeniu, pentru că serverul acestuia nu permite accesul. Funcția care depinde de ele nu va funcționa.",
    ],
    csp: [
      "Resursă blocată de politica de securitate",
      "Politica de securitate a magazinului a blocat o resursă. Dacă resursa este necesară, o funcție sau un serviciu poate lipsi din pagină.",
    ],
    mixed: [
      "Conținut nesecurizat într-o pagină securizată",
      "Pagina securizată (HTTPS) încearcă să încarce o resursă prin HTTP nesecurizat. Browserul o poate bloca și poate afișa avertismente de securitate.",
    ],
  }[kind];
  return {
    key: `17:${kind}:${normalize(target ? hostOf(target) + pathOf(target) : text).slice(0, 80)}`,
    feature: "17",
    severity: "warning",
    title: copy[0],
    summary: copy[1],
    action:
      kind === "mixed"
        ? "Înlocuiește adresele http:// ale resurselor cu https://."
        : kind === "cors"
          ? "Configurează serverul serviciului apelat să permită domeniul magazinului."
          : "Adaugă resursa în politica de securitate (CSP), dacă este legitimă, sau elimin-o din pagină.",
    where: target ? `${hostOf(target)}${pathOf(target)}` : null,
    atMs: Math.round(t),
    thirdParty: !!target && isThird(target),
    source: target ? hostOf(target) : null,
    technical: { kind, text: truncate(text) },
  };
}

function metricFinding(
  key: "lcp" | "cls" | "fcp" | "ttfb",
  value: number | null,
  add: (f: Omit<Finding, "count">) => void,
) {
  const rating = rate(value, vitalThresholds[key]);
  if (value === null || rating === null || rating === "good") return;
  const severe = rating === "poor";
  const sec = (ms: number) => secondsText(ms);
  const copy = {
    lcp: {
      feature: "04",
      title: severe
        ? "Conținutul principal apare foarte lent"
        : "Conținutul principal apare lent",
      summary: `Conținutul principal al paginii apare ${severe ? "foarte " : ""}lent – ${sec(value)}.`,
      action:
        "Optimizează imaginea principală a produsului (dimensiune, format modern, încărcare prioritară) și redu scripturile încărcate înaintea ei.",
    },
    cls: {
      feature: "04",
      title: "Elementele paginii se mută în timpul încărcării",
      summary: `Elementele paginii își schimbă poziția în timpul încărcării (scor ${String(Math.round(value * 100) / 100).replace(".", ",")}). Clienții pot apăsa din greșeală pe alt element.`,
      action:
        "Rezervă spațiu pentru imagini, bannere și widgeturi înainte ca acestea să se încarce.",
    },
    fcp: {
      feature: "05",
      title: "Pagina rămâne goală la început",
      summary: `Pagina rămâne goală ${sec(value)} înainte să apară primul conținut.`,
      action:
        "Redu fișierele CSS și JavaScript care se încarcă înaintea conținutului.",
    },
    ttfb: {
      feature: "03",
      title: "Serverul răspunde lent",
      summary: `Serverul magazinului răspunde lent – ${sec(value)} până la primul răspuns.`,
      action:
        "Verifică hostingul, cache-ul paginilor și aplicațiile instalate care încetinesc serverul.",
    },
  }[key];
  add({
    key: `${copy.feature}:${key}`,
    feature: copy.feature,
    severity: severe ? "problem" : "warning",
    title: copy.title,
    summary: copy.summary,
    action: copy.action,
    where: null,
    atMs: key === "cls" ? null : Math.round(value),
    thirdParty: false,
    source: null,
    technical: {
      metric: key,
      value,
      rating,
      thresholds: vitalThresholds[key],
      lab: true,
    },
  });
}
