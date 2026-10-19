import {
  ArrowRight,
  PackageSearch,
  Plus,
  ScanLine,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import type { Scan, Settings } from "../../../../packages/contracts/src/index";
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
  StackedBars,
  TrendLine,
  ProportionBar,
} from "../components/charts";
import { average, latestPerPage, loadSeries, perDay } from "../lib/stats";
import { scanHealth, summarize, type Health } from "../lib/report";
import { plural, relative, seconds, splitUrl } from "../lib/format";
import { allItems, PDP_MODULE, comingSoonPath } from "../app/navigation";
import { ScanList } from "./ScanList";

export function Overview({
  scans,
  settings,
  navigate,
}: {
  scans: Scan[];
  settings: Settings;
  navigate: (path: string) => void;
}) {
  const pages = latestPerPage(scans);
  const healthCounts = pages.reduce<Partial<Record<Health, number>>>(
    (acc, s) => {
      const h = scanHealth(s);
      const key = h === "na" ? "unknown" : h;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const problems = pages.filter((s) =>
    ["fail", "warn"].includes(scanHealth(s)),
  );
  const failing = pages.filter((s) => scanHealth(s) === "fail").length;
  const avg = average(
    pages
      .map((s) => s.report?.observation.usableMs)
      .filter((v): v is number => typeof v === "number"),
  );
  const monthAgo = Date.now() - 30 * 86400000;
  const recent = scans.filter(
    (s) => Date.parse(s.createdAt) >= monthAgo,
  ).length;
  const running = scans.filter(
    (s) => s.state === "QUEUED" || s.state === "RUNNING",
  ).length;
  const days = perDay(scans);
  const series = loadSeries(scans);
  const soon = allItems.filter((i) => !i.path).slice(0, 5);

  const headline: { health: Health; title: string; detail: string } =
    !pages.length
      ? { health: "unknown", title: "", detail: "" }
      : failing
        ? {
            health: "fail",
            title: `${plural(failing, "pagină are", "pagini au")} probleme`,
            detail:
              "Clienții pot întâmpina erori pe aceste pagini. Vezi detaliile mai jos.",
          }
        : problems.length
          ? {
              health: "warn",
              title: "Magazinul funcționează, cu puncte de atenție",
              detail: `${plural(problems.length, "pagină necesită", "pagini necesită")} atenție.`,
            }
          : (healthCounts.unknown ?? 0) > 0
            ? {
                health: "unknown",
                title: "Nicio problemă confirmată",
                detail: `${plural(healthCounts.unknown ?? 0, "pagină nu a putut fi verificată", "pagini nu au putut fi verificate")} complet.`,
              }
            : {
                health: "ok",
                title: "Toate paginile verificate funcționează",
                detail: `${plural(pages.length, "pagină verificată", "pagini verificate")}, fără probleme detectate.`,
              };

  return (
    <>
      <PageHeader
        title="Prezentare generală"
        description="Starea magazinului tău, pe baza verificărilor efectuate."
      />
      {!pages.length && !running ? (
        <Card className="onboarding">
          <div className="onboarding-grid">
            <div>
              <span className="onboarding-icon">
                <ShieldCheck size={18} />
              </span>
              <h2>Începe cu prima pagină de produs</h2>
              <p>
                Introdu adresa unui produs din magazin. Îl deschidem într-un
                browser real, ca un client, și îți spunem clar ce funcționează
                și ce nu.
              </p>
              <button className="btn primary" onClick={() => navigate("/new")}>
                Verifică o pagină <ArrowRight size={14} />
              </button>
            </div>
            <ol className="onboarding-steps">
              <li>
                <b>1</b>
                <span>
                  <strong>Adaugi adresa produsului</strong>
                  Orice pagină publică din magazinul tău.
                </span>
              </li>
              <li>
                <b>2</b>
                <span>
                  <strong>Deschidem pagina ca un client</strong>
                  Fără instalare în magazin și fără comenzi plasate.
                </span>
              </li>
              <li>
                <b>3</b>
                <span>
                  <strong>Primești un raport pe înțeles</strong>
                  Ce a trecut, ce nu și ce poți face.
                </span>
              </li>
            </ol>
          </div>
        </Card>
      ) : (
        <>
          {pages.length > 0 && (
            <div className={`headline h-${headline.health}`}>
              <StatusIcon health={headline.health} size={28} />
              <div className="headline-text">
                <strong>{headline.title}</strong>
                <span>{headline.detail}</span>
              </div>
              <ProportionBar counts={healthCounts} />
            </div>
          )}
          <div className="metrics">
            <Metric
              label="Pagini verificate"
              value={pages.length}
              hint={
                running
                  ? `${plural(running, "verificare", "verificări")} în curs`
                  : "adrese distincte"
              }
            />
            <Metric
              label="Probleme active"
              value={problems.length}
              tone={failing ? "fail" : problems.length ? "warn" : "ok"}
              hint={
                failing
                  ? `${plural(failing, "pagină", "pagini")} cu erori`
                  : "pe ultima verificare a fiecărei pagini"
              }
            />
            <Metric
              label="Timp mediu de afișare"
              value={seconds(avg)}
              hint={`prag ${seconds(settings.slowThresholdMs)}`}
              tone={
                avg === null
                  ? undefined
                  : avg > settings.slowThresholdMs
                    ? "warn"
                    : "ok"
              }
            />
            <Metric
              label="Verificări în 30 de zile"
              value={recent}
              hint={`${scans.length} în total`}
            />
          </div>
          <div className="grid-2">
            <Card
              title="Verificări pe zi"
              description="Ultimele 14 zile, după rezultat"
              actions={<Legend items={["ok", "warn", "fail", "unknown"]} />}
            >
              <StackedBars data={days} />
            </Card>
            <Card
              title="Timp până la produs vizibil"
              description="Verificările recente, față de pragul tău"
            >
              {series.length ? (
                <TrendLine
                  points={series}
                  threshold={settings.slowThresholdMs}
                />
              ) : (
                <div className="chart-empty">
                  Apare după prima verificare în care produsul a devenit
                  vizibil.
                </div>
              )}
            </Card>
          </div>
          <div className="grid-2-1">
            <Card
              title="Probleme active"
              description="Ultima verificare a fiecărei pagini"
              actions={
                problems.length > 0 && (
                  <button
                    className="link-btn"
                    onClick={() => navigate("/issues")}
                  >
                    Toate <ChevronRight size={13} />
                  </button>
                )
              }
              flush
            >
              {problems.length ? (
                <ul className="issue-list">
                  {problems.slice(0, 5).map((s) => {
                    const sum = summarize(s);
                    const { host, path } = splitUrl(s.url);
                    return (
                      <li key={s.id}>
                        <button onClick={() => navigate(`/scan/${s.id}`)}>
                          <StatusIcon health={sum.health} />
                          <span className="issue-text">
                            <strong>{sum.detail}</strong>
                            <small>
                              {host}
                              {path} · {relative(s.createdAt)}
                            </small>
                          </span>
                          <ChevronRight size={14} className="chev" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty icon={ShieldCheck} title="Nicio problemă activă">
                  Ultima verificare a fiecărei pagini nu a găsit erori.
                </Empty>
              )}
            </Card>
            <Card
              title="Module"
              description="Ce monitorizează StoreGuard"
              flush
            >
              <ul className="module-list">
                <li>
                  <button onClick={() => navigate(PDP_MODULE.path)}>
                    <span className="module-ico">
                      <PackageSearch size={14} />
                    </span>
                    <span className="module-text">
                      <strong>{PDP_MODULE.label}</strong>
                      <small>
                        {plural(pages.length, "pagină", "pagini")} · 7
                        verificări
                      </small>
                    </span>
                    <StatusPill
                      health={
                        failing
                          ? "fail"
                          : problems.length
                            ? "warn"
                            : pages.length
                              ? "ok"
                              : "unknown"
                      }
                      label="Activ"
                    />
                  </button>
                </li>
                {soon.map((item) => (
                  <li key={item.id}>
                    <button onClick={() => navigate(comingSoonPath(item.id))}>
                      <span className="module-ico muted">
                        <item.icon size={14} />
                      </span>
                      <span className="module-text">
                        <strong>{item.label}</strong>
                        <small>{item.group}</small>
                      </span>
                      <span className="tag">În curând</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card
            title="Verificări recente"
            actions={
              <button className="link-btn" onClick={() => navigate("/history")}>
                Istoric complet <ChevronRight size={13} />
              </button>
            }
            flush
          >
            <ScanList scans={scans.slice(0, 6)} navigate={navigate} />
          </Card>
        </>
      )}
      <p className="foot-note">
        <ScanLine size={12} /> Rezultatele provin exclusiv din verificări reale
        efectuate de scannerul tău.
      </p>
    </>
  );
}
