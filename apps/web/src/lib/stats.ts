import type { Scan } from "../../../../packages/contracts/src/index";
import { scanHealth, type Health } from "./report";

const finished = (s: Scan) => s.state !== "QUEUED" && s.state !== "RUNNING";

/** Latest finished scan for every distinct page URL, newest first. */
export function latestPerPage(scans: Scan[]): Scan[] {
  const seen = new Map<string, Scan>();
  for (const scan of scans) {
    if (!finished(scan)) continue;
    const current = seen.get(scan.url);
    if (!current || scan.createdAt > current.createdAt)
      seen.set(scan.url, scan);
  }
  return [...seen.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export interface DayBucket {
  key: string;
  label: string;
  ok: number;
  warn: number;
  fail: number;
  unknown: number;
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Finished checks per local day for the last `days` days, oldest first. */
export function perDay(
  scans: Scan[],
  days = 14,
  now = new Date(),
): DayBucket[] {
  const buckets: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({
      key: dayKey(d),
      label: d.toLocaleDateString("ro-RO", { day: "2-digit", month: "short" }),
      ok: 0,
      warn: 0,
      fail: 0,
      unknown: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const scan of scans) {
    if (!finished(scan)) continue;
    const i = index.get(dayKey(new Date(scan.createdAt)));
    if (i === undefined) continue;
    const h = scanHealth(scan);
    const bucket = buckets[i];
    if (h === "ok") bucket.ok++;
    else if (h === "warn") bucket.warn++;
    else if (h === "fail") bucket.fail++;
    else bucket.unknown++;
  }
  return buckets;
}

export interface LoadPoint {
  id: string;
  at: string;
  url: string;
  usableMs: number;
  health: Health;
}

/** Measured time-to-usable-content of the most recent checks, oldest first. */
export function loadSeries(scans: Scan[], limit = 24): LoadPoint[] {
  return scans
    .filter((s) => s.report?.observation.usableMs != null)
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      at: s.createdAt,
      url: s.url,
      usableMs: s.report!.observation.usableMs as number,
      health: scanHealth(s),
    }))
    .reverse();
}

export function average(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : null;
}
