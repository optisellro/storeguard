import { useState, type FormEvent } from "react";
import * as Checkbox from "@radix-ui/react-checkbox";
import {
  Check,
  ChevronRight,
  Globe2,
  LoaderCircle,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import type {
  MetricValue,
  Rating,
  Scan,
  Settings,
  Store,
} from "../../../../packages/contracts/src/index";
import { vitalThresholds } from "../../../../packages/contracts/src/index";
import {
  Card,
  Empty,
  Metric,
  PageHeader,
  StatusIcon,
  StatusPill,
} from "../components/ui";
import {
  Legend,
  ProportionBar,
  ResultStrip,
  StackedBars,
  TrendLine,
} from "../components/charts";
import { VitalsRow } from "../components/vitals";
import { HistoryTab } from "./HistoryTab";
import {
  latestPerPage,
  median,
  metricSeries,
  perDay,
  storeIssues,
} from "../lib/stats";
import { issuesOf, scanHealth, type Health } from "../lib/report";
import { api } from "../lib/api";
import { dateTime, plural, relative, seconds, splitUrl } from "../lib/format";

export type StoreTab = "overview" | "pages" | "history";

const rate = (
  v: number | null,
  [g, p]: readonly [number, number],
): Rating | null =>
  v === null ? null : v <= g ? "good" : v <= p ? "ni" : "poor";

export function StoreDashboard({
  store,
  scans,
  tab,
  settings,
  navigate,
  onCreated,
}: {
  store: Store;
  scans: Scan[];
  tab: StoreTab;
  settings: Settings;
  navigate: (path: string) => void;
  onCreated: (scan: Scan) => void;
}) {
  const base = `/s/${store.id}`;
  const pages = latestPerPage(scans);
  const tabs: { id: StoreTab; label: string; path: string; count?: number }[] =
    [
      { id: "overview", label: "Prezentare", path: base },
      {
        id: "pages",
        label: "Pagini",
        path: `${base}/pages`,
        count: pages.length,
      },
      {
        id: "history",
        label: "Istoric",
        path: `${base}/history`,
        count: scans.length,
      },
    ];
  return (
    <>
      <PageHeader
        eyebrow="PDP – Pagina de produs"
        title={store.name}
        description={store.domain}
      />
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab on" : "tab"}
            onClick={() => navigate(t.path)}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="tab-count">{t.count}</span>
            )}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <Overview
          store={store}
          scans={scans}
          settings={settings}
          navigate={navigate}
          onCreated={onCreated}
        />
      )}
      {tab === "pages" && (
        <Pages
          store={store}
          scans={scans}
          navigate={navigate}
          onCreated={onCreated}
        />
      )}
      {tab === "history" && (
        <HistoryTab scans={scans} navigate={navigate} base={base} />
      )}
    </>
  );
}

function Overview({
  store,
  scans,
  settings,
  navigate,
  onCreated,
}: {
  store: Store;
  scans: Scan[];
  settings: Settings;
  navigate: (path: string) => void;
  onCreated: (scan: Scan) => void;
}) {
  const base = `/s/${store.id}`;
  const pages = latestPerPage(scans);
  const running = scans.filter(
    (s) => s.state === "QUEUED" || s.state === "RUNNING",
  );
  if (!pages.length)
    return (
      <Card className="onboarding">
        <div className="onboarding-grid">
          <div>
            <span className="onboarding-icon">
              <ShieldCheck size={18} />
            </span>
            <h2>Adaugă prima pagină de produs</h2>
            <p>
              Pentru test, adaugi manual adresa unui produs de pe {store.domain}
              . Pagina este deschisă într-un browser real și analizată tehnic:
              erori ascunse, servicii căzute, fișiere lipsă, viteză.
            </p>
            <AddPage store={store} navigate={navigate} onCreated={onCreated} />
          </div>
          <ol className="onboarding-steps">
            <li>
              <b>1</b>
              <span>
                <strong>Adaugi o pagină de produs</strong>
                Doar adrese de pe domeniul {store.domain}.
              </span>
            </li>
            <li>
              <b>2</b>
              <span>
                <strong>O analizăm ca un client real</strong>
                Fără instalare în magazin, fără comenzi plasate.
              </span>
            </li>
            <li>
              <b>3</b>
              <span>
                <strong>Vezi ce nu se vede</strong>
                Probleme tehnice explicate pe înțeles, cu pași de rezolvare.
              </span>
            </li>
          </ol>
        </div>
        {running.length > 0 && (
          <p className="running-note">
            <LoaderCircle size={13} className="spin" />{" "}
            {plural(running.length, "verificare este", "verificări sunt")} în
            curs.{" "}
            <button
              className="link-btn"
              onClick={() => navigate(`${base}/scan/${running[0].id}`)}
            >
              Urmărește
            </button>
          </p>
        )}
      </Card>
    );

  const issues = storeIssues(scans);
  const problems = issues.filter((i) => i.severity === "problem");
  const warnings = issues.filter((i) => i.severity === "warning");
  const healths = pages.map(scanHealth);
  const affected = healths.filter((h) => h === "fail").length;
  const counts = healths.reduce<Partial<Record<Health, number>>>((acc, h) => {
    const k = h === "na" || h === "off" ? "unknown" : h;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const metric = (
    k: keyof typeof vitalThresholds,
    pick: (s: Scan) => number | null | undefined,
  ): MetricValue => {
    const v = median(pages.map(pick));
    return { value: v, rating: rate(v, vitalThresholds[k]) };
  };
  const vitals = {
    lcp: metric("lcp", (s) => s.report?.diagnostics?.metrics.lcp.value),
    cls: metric("cls", (s) => s.report?.diagnostics?.metrics.cls.value),
    fcp: metric("fcp", (s) => s.report?.diagnostics?.metrics.fcp.value),
    ttfb: metric("ttfb", (s) => s.report?.diagnostics?.metrics.ttfb.value),
    inp: { value: null, rating: null },
    domContentLoadedMs: null,
    loadMs: null,
    usableMs: null,
    totalBlockingMs: null,
    longestTaskMs: null,
  };
  const lcpSeries = metricSeries(
    scans,
    (s) => s.report?.diagnostics?.metrics.lcp.value,
  );
  const headline: { health: Health; title: string; detail: string } = affected
    ? {
        health: "fail",
        title: `${plural(affected, "pagină are", "pagini au")} probleme tehnice confirmate`,
        detail: `${plural(problems.length, "problemă distinctă", "probleme distincte")} pe ${plural(pages.length, "pagină verificată", "pagini verificate")}. Cele mai importante sunt mai jos.`,
      }
    : warnings.length
      ? {
          health: "warn",
          title: "Nicio problemă confirmată, dar există avertizări",
          detail: `${plural(warnings.length, "avertizare tehnică", "avertizări tehnice")} merită verificate.`,
        }
      : {
          health: "ok",
          title: "Nu au fost detectate probleme la paginile verificate",
          detail: `${plural(pages.length, "pagină verificată", "pagini verificate")}. Rezultatul se referă doar la verificările efectuate.`,
        };

  return (
    <>
      <div className={`headline h-${headline.health}`}>
        <StatusIcon health={headline.health} size={28} />
        <div className="headline-text">
          <strong>{headline.title}</strong>
          <span>{headline.detail}</span>
        </div>
        <ProportionBar counts={counts} />
      </div>
      <div className="metrics">
        <Metric
          label="Pagini verificate"
          value={pages.length}
          hint={
            running.length
              ? `${plural(running.length, "verificare", "verificări")} în curs`
              : `ultima ${relative(pages[0].createdAt)}`
          }
        />
        <Metric
          label="Probleme confirmate"
          value={problems.length}
          tone={problems.length ? "fail" : "ok"}
          hint={
            affected
              ? `pe ${plural(affected, "pagină", "pagini")}`
              : "niciuna deschisă"
          }
        />
        <Metric
          label="Avertizări"
          value={warnings.length}
          tone={warnings.length ? "warn" : "ok"}
          hint="semnale tehnice de verificat"
        />
        <Metric
          label="Conținut principal (median)"
          value={seconds(vitals.lcp.value)}
          tone={
            vitals.lcp.rating === "good"
              ? "ok"
              : vitals.lcp.rating === "ni"
                ? "warn"
                : vitals.lcp.rating === "poor"
                  ? "fail"
                  : undefined
          }
          hint="LCP · prag bun 2,5 s"
        />
      </div>
      <div className="grid-2-1">
        <Card
          title="Probleme deschise"
          description="Ultima verificare a fiecărei pagini, grupate"
          actions={
            issues.length > 6 && (
              <button
                className="link-btn"
                onClick={() => navigate(`${base}/pages`)}
              >
                Toate paginile <ChevronRight size={13} />
              </button>
            )
          }
          flush
        >
          {issues.length ? (
            <ul className="issue-list">
              {issues.slice(0, 6).map((i) => (
                <li key={i.key}>
                  <button
                    onClick={() =>
                      navigate(`${base}/scan/${i.pages[0].scanId}`)
                    }
                  >
                    <StatusIcon
                      health={i.severity === "problem" ? "fail" : "warn"}
                    />
                    <span className="issue-text">
                      <strong>{i.finding.title}</strong>
                      <span>{i.finding.summary}</span>
                      <small>
                        {plural(
                          i.pages.length,
                          "pagină afectată",
                          "pagini afectate",
                        )}{" "}
                        · prima dată {relative(i.firstSeen)}
                      </small>
                    </span>
                    {i.finding.thirdParty && (
                      <span className="tag">Serviciu extern</span>
                    )}
                    <ChevronRight size={14} className="chev" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={ShieldCheck} title="Nicio problemă deschisă">
              Ultima verificare a fiecărei pagini nu a găsit probleme.
            </Empty>
          )}
        </Card>
        <Card
          title="Core Web Vitals"
          description="Mediana paginilor verificate"
        >
          <VitalsRow d={vitals} compact />
        </Card>
      </div>
      <div className="grid-2">
        <Card
          title="Verificări pe zi"
          description="Ultimele 14 zile, după rezultat"
          actions={<Legend items={["ok", "warn", "fail", "unknown"]} />}
        >
          <StackedBars data={perDay(scans)} />
        </Card>
        <Card
          title="Conținut principal în timp"
          description="LCP la fiecare verificare, față de pragul bun de 2,5 s"
        >
          {lcpSeries.length >= 2 ? (
            <TrendLine
              points={lcpSeries}
              threshold={vitalThresholds.lcp[0]}
              label="LCP în verificările recente"
            />
          ) : (
            <div className="chart-empty">
              Evoluția apare după cel puțin două verificări cu măsurători.
            </div>
          )}
        </Card>
      </div>
      <PagesTable scans={scans} navigate={navigate} base={base} limit={8} />
      <p className="foot-note">
        <ScanLine size={12} /> Măsurători de laborator (browser desktop) din
        verificările acestui magazin. Pragul de încărcare lentă:{" "}
        {seconds(settings.slowThresholdMs)}.
      </p>
    </>
  );
}

function Pages({
  store,
  scans,
  navigate,
  onCreated,
}: {
  store: Store;
  scans: Scan[];
  navigate: (path: string) => void;
  onCreated: (scan: Scan) => void;
}) {
  return (
    <>
      <Card
        title="Adaugă o pagină de produs"
        description={`Pentru test: adresa unui produs de pe ${store.domain}. Pagina este verificată imediat.`}
      >
        <AddPage store={store} navigate={navigate} onCreated={onCreated} />
      </Card>
      <PagesTable scans={scans} navigate={navigate} base={`/s/${store.id}`} />
    </>
  );
}

function PagesTable({
  scans,
  navigate,
  base,
  limit,
}: {
  scans: Scan[];
  navigate: (p: string) => void;
  base: string;
  limit?: number;
}) {
  const pages = latestPerPage(scans);
  const shown = limit ? pages.slice(0, limit) : pages;
  if (!pages.length) return null;
  return (
    <Card
      title="Pagini verificate"
      description="Starea fiecărei pagini la ultima verificare"
      actions={
        limit && pages.length > limit ? (
          <button
            className="link-btn"
            onClick={() => navigate(`${base}/pages`)}
          >
            Toate cele {pages.length} <ChevronRight size={13} />
          </button>
        ) : undefined
      }
      flush
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Pagină</th>
              <th>Stare</th>
              <th className="num">Probleme</th>
              <th className="num">Avertizări</th>
              <th className="num">Conținut principal</th>
              <th>Ultimele verificări</th>
              <th>Verificată</th>
              <th aria-label="Deschide" />
            </tr>
          </thead>
          <tbody>
            {shown.map((latest) => {
              const { host, path } = splitUrl(latest.url);
              const iss = issuesOf(latest);
              const history = scans
                .filter(
                  (s) =>
                    s.url === latest.url &&
                    s.state !== "QUEUED" &&
                    s.state !== "RUNNING",
                )
                .slice(0, 12)
                .reverse();
              const p = iss.filter((i) => i.severity === "problem").length;
              const w = iss.length - p;
              return (
                <tr
                  key={latest.url}
                  className="row-link"
                  onClick={() => navigate(`${base}/scan/${latest.id}`)}
                >
                  <td>
                    <span className="page-cell">
                      <strong>{path}</strong>
                      <small>{host}</small>
                    </span>
                  </td>
                  <td>
                    <StatusPill health={scanHealth(latest)} />
                  </td>
                  <td className={`num mono${p ? " txt-fail" : ""}`}>{p}</td>
                  <td className={`num mono${w ? " txt-warn" : ""}`}>{w}</td>
                  <td className="num mono">
                    {seconds(latest.report?.diagnostics?.metrics.lcp.value)}
                  </td>
                  <td>
                    <ResultStrip
                      items={history.map((s) => ({
                        id: s.id,
                        health: scanHealth(s),
                        at: s.createdAt,
                      }))}
                    />
                  </td>
                  <td
                    className="muted-cell nowrap"
                    title={dateTime(latest.createdAt)}
                  >
                    {relative(latest.createdAt)}
                  </td>
                  <td className="go">
                    <ChevronRight size={14} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AddPage({
  store,
  navigate,
  onCreated,
}: {
  store: Store;
  navigate: (path: string) => void;
  onCreated: (scan: Scan) => void;
}) {
  const [url, setUrl] = useState("");
  const [expectedActive, setExpected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const scan = await api<Scan>("/scans", {
        method: "POST",
        body: JSON.stringify({
          storeId: store.id,
          url: url.trim(),
          expectedActive,
        }),
      });
      onCreated(scan);
      navigate(`/s/${store.id}/scan/${scan.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="add-page" onSubmit={submit}>
      <label className="field-label" htmlFor="product-url">
        Adresa paginii de produs
      </label>
      <div className="add-row">
        <div className="input-icon">
          <Globe2 size={14} />
          <input
            id="product-url"
            type="url"
            required
            maxLength={2048}
            placeholder={`https://${store.domain}/produs/exemplu`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <ScanLine size={14} />
          )}
          Pornește verificarea
        </button>
      </div>
      <label className="check-inline">
        <Checkbox.Root
          className="checkbox"
          checked={expectedActive}
          onCheckedChange={(v) => setExpected(v === true)}
        >
          <Checkbox.Indicator>
            <Check size={11} strokeWidth={3} />
          </Checkbox.Indicator>
        </Checkbox.Root>
        Produsul ar trebui să fie activ (o pagină „produs negăsit” va fi
        raportată ca problemă)
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
