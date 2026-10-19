import { useState } from "react";
import type {
  Diagnostics,
  MetricValue,
  Rating,
  WaterfallEntry,
} from "../../../../packages/contracts/src/index";
import { vitalThresholds } from "../../../../packages/contracts/src/index";
import { seconds } from "../lib/format";

export const ratingLabel: Record<Rating, string> = {
  good: "Bun",
  ni: "De îmbunătățit",
  poor: "Slab",
};
const ratingHealth: Record<Rating, string> = {
  good: "ok",
  ni: "warn",
  poor: "fail",
};

type VitalKey = keyof typeof vitalThresholds;
const vitalCopy: Record<VitalKey, { name: string; hint: string }> = {
  lcp: {
    name: "Conținut principal",
    hint: "Când apare elementul principal (LCP)",
  },
  cls: { name: "Stabilitatea paginii", hint: "Cât se mută elementele (CLS)" },
  fcp: { name: "Primul conținut", hint: "Când apare primul element (FCP)" },
  ttfb: { name: "Răspunsul serverului", hint: "Până la primul răspuns (TTFB)" },
  inp: { name: "Reacția la click", hint: "Necesită vizitatori reali (INP)" },
};
export const formatVital = (key: VitalKey, value: number | null) =>
  value === null
    ? "—"
    : key === "cls"
      ? value.toLocaleString("ro-RO", { maximumFractionDigits: 2 })
      : key === "inp"
        ? `${Math.round(value)} ms`
        : seconds(value);

/** One Web Vital with its value and the official good / needs-improvement / poor scale. */
export function VitalCard({ k, metric }: { k: VitalKey; metric: MetricValue }) {
  const [good, poor] = vitalThresholds[k];
  const max = poor * 1.5;
  const pos =
    metric.value === null ? null : Math.min(100, (metric.value / max) * 100);
  return (
    <div
      className={`vital${metric.rating ? ` h-${ratingHealth[metric.rating]}` : " is-empty"}`}
    >
      <div className="vital-top">
        <span className="vital-name">{vitalCopy[k].name}</span>
        {metric.rating && (
          <span className="vital-rating">{ratingLabel[metric.rating]}</span>
        )}
      </div>
      <strong className="vital-value">{formatVital(k, metric.value)}</strong>
      <div className="vital-scale" aria-hidden="true">
        <span className="z-good" style={{ width: `${(good / max) * 100}%` }} />
        <span
          className="z-ni"
          style={{ width: `${((poor - good) / max) * 100}%` }}
        />
        <span className="z-poor" />
        {pos !== null && <i style={{ left: `${pos}%` }} />}
      </div>
      <span className="vital-hint">{vitalCopy[k].hint}</span>
    </div>
  );
}

export function VitalsRow({
  d,
  compact = false,
}: {
  d: Diagnostics["metrics"];
  compact?: boolean;
}) {
  const keys: VitalKey[] = compact
    ? ["lcp", "cls", "fcp", "ttfb"]
    : ["lcp", "cls", "fcp", "ttfb", "inp"];
  return (
    <div className={`vitals${compact ? " compact" : ""}`}>
      {keys.map((k) => (
        <VitalCard key={k} k={k} metric={d[k]} />
      ))}
    </div>
  );
}

/** Loading milestones of one visit on a single axis, numbered in time order. */
export function Milestones({
  m,
  threshold,
}: {
  m: Diagnostics["metrics"];
  threshold: number;
}) {
  const points = [
    { key: "ttfb", label: "Răspuns server", value: m.ttfb.value },
    { key: "fcp", label: "Primul conținut", value: m.fcp.value },
    { key: "dcl", label: "Structură gata", value: m.domContentLoadedMs },
    { key: "lcp", label: "Conținut principal", value: m.lcp.value },
    { key: "usable", label: "Produs utilizabil", value: m.usableMs },
    { key: "load", label: "Încărcare completă", value: m.loadMs },
  ]
    .filter(
      (p): p is { key: string; label: string; value: number } =>
        p.value !== null,
    )
    .sort((a, b) => a.value - b.value);
  const end = Math.max(threshold, ...points.map((p) => p.value)) * 1.05 || 1;
  const pct = (v: number) => `${(v / end) * 100}%`;
  if (!points.length)
    return (
      <p className="muted-small">
        Timpii nu au putut fi măsurați pentru această verificare.
      </p>
    );
  return (
    <div className="milestones">
      <div className="ms-track">
        <span
          className="ms-fill"
          style={{ width: pct(points.at(-1)!.value) }}
        />
        {points.map((p, i) => (
          <span
            key={p.key}
            className="ms-dot"
            style={{ left: pct(p.value) }}
            title={`${p.label}: ${seconds(p.value)}`}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="ms-scale">
        <span>0 s</span>
        <span>{seconds(end)}</span>
      </div>
      <ol className="ms-legend">
        {points.map((p, i) => (
          <li key={p.key}>
            <b>{i + 1}</b>
            <span>{p.label}</span>
            <strong className="mono">{seconds(p.value)}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

const typeLabel: Record<string, string> = {
  document: "Pagină",
  script: "Script",
  stylesheet: "Stil",
  image: "Imagine",
  font: "Font",
  xhr: "Date",
  fetch: "Date",
  media: "Media",
};

/** Network waterfall: when each request started and how long it took. */
export function Waterfall({
  entries,
  fcp,
  lcp,
  slowMs = 3000,
}: {
  entries: WaterfallEntry[];
  fcp: number | null;
  lcp: number | null;
  slowMs?: number;
}) {
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "problems" | "third">("all");
  const filtered = entries.filter((e) =>
    filter === "problems"
      ? e.failed ||
        (e.status ?? 0) >= 400 ||
        (e.duration ?? 0) > slowMs ||
        e.blocking
      : filter === "third"
        ? e.thirdParty
        : true,
  );
  const shown = all ? filtered : filtered.slice(0, 25);
  const end =
    Math.max(1, ...entries.map((e) => e.start + (e.duration ?? 0)), lcp ?? 0) *
    1.03;
  const pct = (v: number) => `${(v / end) * 100}%`;
  const file = (url: string) => {
    try {
      const u = new URL(url);
      return u.pathname.split("/").filter(Boolean).at(-1) ?? u.hostname;
    } catch {
      return url;
    }
  };
  return (
    <div className="waterfall">
      <div className="wf-tools">
        <div className="segmented" role="group" aria-label="Filtrează cererile">
          {(
            [
              ["all", `Toate · ${entries.length}`],
              ["problems", "Cu probleme"],
              ["third", "Servicii externe"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "on" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="legend">
          <span>
            <span className="swatch wf-first" />
            Magazin
          </span>
          <span>
            <span className="swatch wf-third" />
            Extern
          </span>
          <span>
            <span className="swatch h-warn" />
            Lent / blochează afișarea
          </span>
          <span>
            <span className="swatch h-fail" />
            Eșuat
          </span>
        </div>
      </div>
      <div className="wf-rows">
        <div className="wf-marks">
          {fcp !== null && (
            <span
              className="wf-mark"
              style={{ left: pct(fcp) }}
              title={`Primul conținut: ${seconds(fcp)}`}
            >
              FCP
            </span>
          )}
          {lcp !== null && (
            <span
              className="wf-mark lcp"
              style={{ left: pct(lcp) }}
              title={`Conținut principal: ${seconds(lcp)}`}
            >
              LCP
            </span>
          )}
        </div>
        {shown.map((e, i) => {
          const bad = !!e.failed || (e.status ?? 0) >= 400;
          const slow = (e.duration ?? 0) > slowMs || e.blocking;
          return (
            <div
              key={i}
              className="wf-row"
              title={`${e.url}\n${typeLabel[e.type] ?? e.type} · ${e.failed ?? e.status ?? ""} · ${e.duration === null ? "—" : `${e.duration} ms`}`}
            >
              <span className="wf-name">
                <b>{file(e.url)}</b>
                <small>
                  {typeLabel[e.type] ?? e.type} · {e.host}
                </small>
              </span>
              <span className="wf-lane">
                <span
                  className={`wf-bar ${bad ? "h-fail" : slow ? "h-warn" : e.thirdParty ? "wf-third" : "wf-first"}`}
                  style={{
                    left: pct(e.start),
                    width: `max(2px, ${pct(e.duration ?? 0)})`,
                  }}
                />
              </span>
              <span className="wf-time mono">
                {e.failed
                  ? "eșuat"
                  : e.duration === null
                    ? "—"
                    : `${e.duration} ms`}
              </span>
            </div>
          );
        })}
        {!shown.length && (
          <p className="muted-small wf-empty">
            Nicio cerere pentru acest filtru.
          </p>
        )}
      </div>
      {filtered.length > 25 && (
        <button className="link-btn wf-more" onClick={() => setAll(!all)}>
          {all
            ? "Arată mai puține"
            : `Arată toate cele ${filtered.length} cereri`}
        </button>
      )}
    </div>
  );
}
