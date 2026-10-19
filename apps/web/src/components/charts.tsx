import { useEffect, useRef, useState } from "react";
import type { DayBucket, LoadPoint } from "../lib/stats";
import { dateTime, seconds, splitUrl } from "../lib/format";
import { healthLabel, type Health } from "../lib/report";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const niceMax = (value: number) => {
  if (value <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= value) return m * step;
  return 10 * step;
};

const SERIES: { key: "ok" | "warn" | "fail" | "unknown"; health: Health }[] = [
  { key: "ok", health: "ok" },
  { key: "warn", health: "warn" },
  { key: "fail", health: "fail" },
  { key: "unknown", health: "unknown" },
];

export function Legend({ items }: { items: Health[] }) {
  return (
    <div className="legend">
      {items.map((h) => (
        <span key={h}>
          <span className={`swatch h-${h}`} />
          {healthLabel[h]}
        </span>
      ))}
    </div>
  );
}

/** Checks per day, stacked by result. */
export function StackedBars({
  data,
  height = 168,
}: {
  data: DayBucket[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 8, right: 4, bottom: 22, left: 26 };
  const totals = data.map((d) => d.ok + d.warn + d.fail + d.unknown);
  const max = niceMax(Math.max(1, ...totals));
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const slot = data.length ? plotW / data.length : 0;
  const bar = Math.max(4, Math.min(22, slot * 0.56));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(
    data.length / Math.max(1, Math.floor(plotW / 54)),
  );
  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Verificări pe zi, după rezultat"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                className="grid"
                x1={pad.left}
                x2={width - pad.right}
                y1={y(t)}
                y2={y(t)}
              />
              <text
                className="axis"
                x={pad.left - 8}
                y={y(t) + 3}
                textAnchor="end"
              >
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.left + slot * i + (slot - bar) / 2;
            let acc = 0;
            return (
              <g
                key={d.key}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  className="hit"
                  x={pad.left + slot * i}
                  y={pad.top}
                  width={slot}
                  height={plotH}
                />
                {SERIES.map(({ key, health }) => {
                  const v = d[key];
                  if (!v) return null;
                  const top = y(acc + v);
                  const h = y(acc) - top;
                  acc += v;
                  return (
                    <rect
                      key={key}
                      className={`bar h-${health}`}
                      x={x}
                      y={top + 0.5}
                      width={bar}
                      height={Math.max(1, h - 1)}
                      rx={2}
                    />
                  );
                })}
                {(data.length - 1 - i) % labelEvery === 0 && (
                  <text
                    className="axis"
                    x={pad.left + slot * i + slot / 2}
                    y={height - 6}
                    textAnchor="middle"
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="tooltip"
          style={{
            left: Math.min(
              width - 150,
              Math.max(0, pad.left + slot * hover + slot / 2 - 75),
            ),
          }}
        >
          <strong>{data[hover].label}</strong>
          {totals[hover] === 0 ? (
            <span>Nicio verificare</span>
          ) : (
            SERIES.filter(({ key }) => data[hover][key] > 0).map(
              ({ key, health }) => (
                <span key={key}>
                  <span className={`swatch h-${health}`} />
                  {healthLabel[health]}
                  <b>{data[hover][key]}</b>
                </span>
              ),
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Time to usable content across recent checks, with the configured threshold. */
export function TrendLine({
  points,
  threshold,
  height = 168,
}: {
  points: LoadPoint[];
  threshold: number;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 10, right: 8, bottom: 22, left: 34 };
  const maxMs =
    niceMax(
      Math.max(threshold * 1.15, ...points.map((p) => p.usableMs)) / 1000,
    ) * 1000;
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) =>
    pad.left +
    (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (ms: number) => pad.top + plotH - (ms / maxMs) * plotH;
  const path = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.usableMs).toFixed(1)}`,
    )
    .join(" ");
  const area =
    points.length > 1
      ? `${path} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
      : "";
  const ticks = [0, maxMs / 2, maxMs];
  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Timpul până la conținut vizibil în verificările recente"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            if (!points.length) return;
            const box = e.currentTarget.getBoundingClientRect();
            const rel = e.clientX - box.left - pad.left;
            const i =
              points.length === 1
                ? 0
                : Math.round((rel / Math.max(1, plotW)) * (points.length - 1));
            setHover(Math.max(0, Math.min(points.length - 1, i)));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                className="grid"
                x1={pad.left}
                x2={width - pad.right}
                y1={y(t)}
                y2={y(t)}
              />
              <text
                className="axis"
                x={pad.left - 8}
                y={y(t) + 3}
                textAnchor="end"
              >
                {`${(t / 1000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}s`}
              </text>
            </g>
          ))}
          <line
            className="threshold"
            x1={pad.left}
            x2={width - pad.right}
            y1={y(threshold)}
            y2={y(threshold)}
          />
          <text
            className="axis threshold-label"
            x={pad.left + 6}
            y={y(threshold) - 5}
            textAnchor="start"
          >
            prag {seconds(threshold)}
          </text>
          {area && <path className="trend-area" d={area} />}
          {points.length > 1 && <path className="trend-line" d={path} />}
          {hover !== null && (
            <line
              className="cursor"
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.top}
              y2={pad.top + plotH}
            />
          )}
          {points.map((p, i) => (
            <circle
              key={p.id}
              className={`point h-${p.usableMs > threshold ? "warn" : "ok"}`}
              cx={x(i)}
              cy={y(p.usableMs)}
              r={hover === i ? 4.5 : 3}
            />
          ))}
        </svg>
      )}
      {hover !== null && points[hover] && width > 0 && (
        <div
          className="tooltip"
          style={{ left: Math.min(width - 190, Math.max(0, x(hover) - 95)) }}
        >
          <strong>{seconds(points[hover].usableMs)}</strong>
          <span>
            {splitUrl(points[hover].url).host}
            {splitUrl(points[hover].url).path}
          </span>
          <span>{dateTime(points[hover].at)}</span>
        </div>
      )}
    </div>
  );
}

/** Proportion of results as one horizontal bar. */
export function ProportionBar({
  counts,
}: {
  counts: Partial<Record<Health, number>>;
}) {
  const order: Health[] = ["fail", "warn", "unknown", "ok"];
  const total = order.reduce((s, h) => s + (counts[h] ?? 0), 0);
  return (
    <div
      className="proportion"
      role="img"
      aria-label="Distribuția rezultatelor"
    >
      {total === 0 ? (
        <span className="proportion-empty" />
      ) : (
        order
          .filter((h) => counts[h])
          .map((h) => (
            <span
              key={h}
              className={`h-${h}`}
              style={{ flexGrow: counts[h] }}
              title={`${healthLabel[h]}: ${counts[h]}`}
            />
          ))
      )}
    </div>
  );
}

/** Loading milestones of one page visit on a single time axis. */
export function LoadTimeline({
  domMs,
  navigationMs,
  usableMs,
  threshold,
}: {
  domMs: number | null;
  navigationMs: number | null;
  usableMs: number | null;
  threshold: number;
}) {
  const end =
    Math.max(threshold, usableMs ?? 0, domMs ?? 0, navigationMs ?? 0) * 1.08 ||
    1;
  const pct = (v: number) => `${Math.min(100, (v / end) * 100)}%`;
  const response = domMs ?? navigationMs;
  const slow = usableMs !== null && usableMs > threshold;
  const steps = [
    { label: "Pagina a răspuns", value: response },
    { label: "Produs vizibil", value: usableMs },
  ];
  return (
    <div className="timeline">
      <div className="timeline-track">
        {response !== null && (
          <span
            className="timeline-seg seg-response"
            style={{ width: pct(response) }}
          />
        )}
        {usableMs !== null && response !== null && (
          <span
            className={`timeline-seg ${slow ? "seg-slow" : "seg-render"}`}
            style={{
              left: pct(response),
              width: pct(Math.max(0, usableMs - response)),
            }}
          />
        )}
        <span
          className="timeline-threshold"
          style={{ left: pct(threshold) }}
          title="Pragul tău"
        />
      </div>
      <div className="timeline-scale">
        <span>0 s</span>
        <span
          style={{ left: pct(threshold) }}
          className={`timeline-threshold-label${threshold / end > 0.8 ? " at-end" : ""}`}
        >
          prag {seconds(threshold)}
        </span>
      </div>
      <dl className="timeline-steps">
        {steps.map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>{seconds(s.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Compact result history of one page (oldest → newest). */
export function ResultStrip({
  items,
}: {
  items: { id: string; health: Health; at: string }[];
}) {
  return (
    <div className="strip">
      {items.map((item) => (
        <span
          key={item.id}
          className={`strip-cell h-${item.health}`}
          title={`${dateTime(item.at)} · ${healthLabel[item.health]}`}
        />
      ))}
    </div>
  );
}
