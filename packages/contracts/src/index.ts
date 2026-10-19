import { z } from "zod";
const selector = z.string().trim().max(300).default("");
export const settingsSchema = z
  .object({
    navigationTimeoutMs: z.number().int().min(200).max(30000).default(15000),
    renderTimeoutMs: z.number().int().min(400).max(30000).default(20000),
    slowThresholdMs: z.number().int().min(100).max(30000).default(8000),
    globalTimeoutMs: z.number().int().min(1000).max(60000).default(45000),
    maxRedirects: z.number().int().min(1).max(20).default(10),
    /** Extra observation after the page is usable, to catch late errors and requests. */
    settleMs: z.number().int().min(0).max(15000).default(3000),
    loaderSelector: selector,
    errorSelector: selector,
    errorMessages: z
      .array(z.string().trim().min(3).max(200))
      .max(20)
      .default([]),
    expectedDomain: z
      .string()
      .trim()
      .max(253)
      .default("")
      .refine(
        (v) =>
          !v ||
          /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(
            v,
          ),
        "Introdu un domeniu fără protocol.",
      ),
    expectedUrl: z
      .union([z.literal(""), z.url({ protocol: /^https?$/ })])
      .default(""),
  })
  .refine(
    (v) =>
      v.globalTimeoutMs >= v.navigationTimeoutMs &&
      v.globalTimeoutMs >= v.renderTimeoutMs,
    "Timeoutul global trebuie să fie cel puțin egal cu fiecare timeout individual.",
  );
export const scanInputSchema = z.object({
  storeId: z.string().uuid(),
  url: z.url({ protocol: /^https?$/ }).max(2048),
  expectedActive: z.boolean().default(false),
});
const domainPattern =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
/** Store domain without protocol or "www."; pages must belong to it or a subdomain. */
export const normalizeDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
export const storeInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Numele trebuie să aibă cel puțin 2 caractere.")
    .max(80),
  domain: z
    .string()
    .max(253)
    .transform(normalizeDomain)
    .refine(
      (v) => domainPattern.test(v),
      "Introdu un domeniu valid, de exemplu magazin.ro.",
    ),
});
export function belongsToDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}
export interface Store {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
}
export type Settings = z.infer<typeof settingsSchema>;
export const defaults = settingsSchema.parse({});
export type Verdict =
  | "PASS"
  | "FAIL"
  | "WARNING"
  | "INCONCLUSIVE"
  | "NOT_APPLICABLE";
export type ScanState =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED";
/** Real progress of a running scan, emitted by the engine as each stage starts. */
export type ScanPhase =
  | "PREPARING"
  | "NAVIGATING"
  | "OBSERVING"
  | "EVALUATING"
  | "EVIDENCE";
export const scanPhases: ScanPhase[] = [
  "PREPARING",
  "NAVIGATING",
  "OBSERVING",
  "EVALUATING",
  "EVIDENCE",
];
export interface RuleResult {
  id: string;
  name: string;
  status: Verdict;
  explanation: string;
  technical: Record<string, unknown>;
}
export interface Sample {
  atMs: number;
  readyState: string;
  textChars: number;
  visibleElements: number;
  mediaElements: number;
  contentArea: number;
  loader: boolean;
  loaderBlocking: boolean;
  genericLoader: boolean;
  productSignal: boolean;
  cookieBanner: boolean;
  softError: boolean;
  blocked: string | null;
  complexVisual: boolean;
  signature: string;
}
export interface Observation {
  httpStatus: number | null;
  finalUrl: string;
  redirects: { url: string; status: number }[];
  navigationMs: number | null;
  domContentLoadedMs: number | null;
  usableMs: number | null;
  totalMs: number;
  navigationError: string | null;
  environmentError: string | null;
  securityBlocked: boolean;
  blockedRequests: number;
  redirectError: string | null;
  samples: Sample[];
  screenshot: boolean;
  selectorError: string | null;
  /** Page analysis failure (absent in reports created before engine 1.1.0). */
  analysisError?: string | null;
}
/* ---------- Technical diagnostics (PDP) ---------- */
export type FeatureStatus =
  | "fail"
  | "warn"
  | "ok"
  | "unknown"
  | "not_run"
  | "unavailable";
export type Severity = "problem" | "warning";
export type Rating = "good" | "ni" | "poor";
export interface Finding {
  /** Stable fingerprint, used to group the same issue across scans. */
  key: string;
  feature: string;
  severity: Severity;
  title: string;
  summary: string;
  action: string;
  /** Where it happened, in plain words (file, service, address). */
  where: string | null;
  /** Milliseconds from navigation start, when known. */
  atMs: number | null;
  count: number;
  thirdParty: boolean;
  /** Host of the script or service involved, used for correlation. */
  source: string | null;
  technical: Record<string, unknown>;
}
export interface MetricValue {
  value: number | null;
  rating: Rating | null;
}
export interface WaterfallEntry {
  url: string;
  host: string;
  type: string;
  start: number;
  duration: number | null;
  status: number | null;
  failed: string | null;
  thirdParty: boolean;
  blocking: boolean;
}
export interface ThirdParty {
  host: string;
  category: string;
  requests: number;
  failures: number;
  slowestMs: number | null;
}
export interface FeatureResult {
  id: string;
  status: FeatureStatus;
  summary: string;
}
export interface Correlation {
  source: string;
  count: number;
  features: string[];
}
export interface Diagnostics {
  version: string;
  metrics: {
    ttfb: MetricValue;
    fcp: MetricValue;
    lcp: MetricValue;
    cls: MetricValue;
    inp: MetricValue;
    domContentLoadedMs: number | null;
    loadMs: number | null;
    usableMs: number | null;
    totalBlockingMs: number | null;
    longestTaskMs: number | null;
  };
  findings: Finding[];
  waterfall: WaterfallEntry[];
  thirdParties: ThirdParty[];
  correlations: Correlation[];
  features: FeatureResult[];
  counts: {
    requests: number;
    failedRequests: number;
    jsErrors: number;
    consoleErrors: number;
    consoleWarnings: number;
    longTasks: number;
  };
  /** Observation window after the page became usable. */
  settleMs: number;
}
export interface Report {
  observation: Observation;
  rules: RuleResult[];
  engineVersion: string;
  rulesVersion: string;
  verdict: Verdict;
  /** Technical diagnostics; absent for reports created before engine 2.0.0. */
  diagnostics?: Diagnostics;
}
export interface Scan {
  id: string;
  storeId: string;
  url: string;
  expectedActive: boolean;
  state: ScanState;
  createdAt: string;
  finishedAt: string | null;
  settings: Settings;
  report: Report | null;
  error: string | null;
  /** Current stage while RUNNING; absent for older records. */
  phase?: ScanPhase | null;
  /** A masked live preview of the page exists while the scan runs. */
  preview?: boolean;
}
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname
      .replace(/[^/]*@[^/]+/g, "[redacted]")
      .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]");
    return url.href;
  } catch {
    return "[URL indisponibil]";
  }
}
export * from "./features.js";
