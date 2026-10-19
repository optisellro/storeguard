import { z } from "zod";
const selector = z.string().trim().max(300).default("");
export const settingsSchema = z
  .object({
    navigationTimeoutMs: z.number().int().min(200).max(30000).default(15000),
    renderTimeoutMs: z.number().int().min(400).max(30000).default(20000),
    slowThresholdMs: z.number().int().min(100).max(30000).default(8000),
    globalTimeoutMs: z.number().int().min(1000).max(60000).default(45000),
    maxRedirects: z.number().int().min(1).max(20).default(10),
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
  url: z.url({ protocol: /^https?$/ }).max(2048),
  expectedActive: z.boolean().default(false),
});
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
export interface Report {
  observation: Observation;
  rules: RuleResult[];
  engineVersion: string;
  rulesVersion: string;
  verdict: Verdict;
}
export interface Scan {
  id: string;
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
