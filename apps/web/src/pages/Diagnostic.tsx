import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  Wrench,
  X,
  Plug,
} from "lucide-react";
import type {
  DiagnosticTab,
  FeatureResult,
  Finding,
  Scan,
  Store,
} from "../../../../packages/contracts/src/index";
import { pdpFeatures } from "../../../../packages/contracts/src/index";
import { Card, StatusIcon, StatusPill } from "../components/ui";
import { ResultStrip } from "../components/charts";
import { Milestones, VitalsRow, Waterfall } from "../components/vitals";
import { ScanProgress } from "../components/ScanProgress";
import {
  explainRule,
  featureHealth,
  healthLabel,
  issuesOf,
  ruleOrder,
  scanHealth,
  summarize,
  type Health,
} from "../lib/report";
import { api } from "../lib/api";
import { dateTime, plural, relative, seconds, splitUrl } from "../lib/format";

type Tab = "overview" | DiagnosticTab;
const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Prezentare" },
  { id: "performance", label: "Încărcare și performanță" },
  { id: "network", label: "JavaScript și rețea" },
  { id: "browsers", label: "Browsere și regresii" },
  { id: "experience", label: "Experiența utilizatorilor" },
  { id: "insights", label: "Erori și corelări" },
];
const featureDef = (id: string) => pdpFeatures.find((f) => f.id === id);
const tabsOf = (feature: string): DiagnosticTab[] =>
  featureDef(feature)?.tabs ?? ["performance"];
const severityHealth = (f: Finding): Health =>
  f.severity === "problem" ? "fail" : "warn";

/** One-sentence conclusion, never more definitive than the data allows. */
function conclusion(scan: Scan, issues: Finding[], features: FeatureResult[]) {
  const legacy = summarize(scan);
  const reachFailed = features.find((f) => f.id === "01")?.status === "fail";
  const notRun = features.filter(
    (f) => f.status === "not_run" || f.status === "unavailable",
  ).length;
  if (
    !scan.report ||
    reachFailed ||
    (legacy.health === "unknown" && !issues.length)
  )
    return {
      health: legacy.health,
      title: legacy.title,
      detail: legacy.detail,
    };
  const problems = issues.filter((i) => i.severity === "problem").length;
  const warnings = issues.length - problems;
  if (problems)
    return {
      health: "fail" as Health,
      title: `Pagina se încarcă, dar au fost identificate ${plural(problems, "problemă tehnică", "probleme tehnice")} care pot afecta experiența clienților.`,
      detail: warnings
        ? `În plus, ${plural(warnings, "avertizare merită verificată", "avertizări merită verificate")}.`
        : issues[0].summary,
    };
  if (warnings)
    return {
      health: "warn" as Health,
      title: `Pagina se încarcă. Am găsit ${plural(warnings, "avertizare tehnică", "avertizări tehnice")} care merită verificate.`,
      detail: issues[0].summary,
    };
  return {
    health: "ok" as Health,
    title: "Nu au fost detectate probleme la verificările efectuate.",
    detail: notRun
      ? `${plural(notRun, "verificare nu a fost executată", "verificări nu au fost executate")} în această scanare (necesită istoric, scanări suplimentare sau scriptul în magazin).`
      : "Toate verificările disponibile au fost executate.",
  };
}

export function Diagnostic({
  scanId,
  store,
  history,
  navigate,
  onCreated,
}: {
  scanId: string;
  store: Store;
  history: Scan[];
  navigate: (path: string) => void;
  onCreated: (scan: Scan) => void;
}) {
  const light = history.find((s) => s.id === scanId);
  const [full, setFull] = useState<Scan | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [open, setOpen] = useState<Finding | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running =
    !light || light.state === "QUEUED" || light.state === "RUNNING";
  useEffect(() => {
    setTab("overview");
    setOpen(null);
  }, [scanId]);
  // The full report (waterfall, technical evidence) is loaded once the scan has finished.
  useEffect(() => {
    if (running || full?.id === scanId) return;
    let active = true;
    api<Scan>(`/scans/${scanId}`)
      .then((s) => active && setFull(s))
      .catch((e) => active && setError((e as Error).message));
    return () => {
      active = false;
    };
  }, [scanId, running, full?.id]);
  const scan = full?.id === scanId ? full : light;
  const issues = useMemo(() => (scan ? issuesOf(scan) : []), [scan]);
  if (!scan)
    return <div className="loading">Verificarea nu a fost găsită.</div>;
  const { host } = splitUrl(scan.url);
  const storePath = `/s/${store.id}`;

  const rescan = async () => {
    setBusy(true);
    setError("");
    try {
      const created = await api<Scan>("/scans", {
        method: "POST",
        body: JSON.stringify({
          storeId: store.id,
          url: scan.url,
          expectedActive: scan.expectedActive,
        }),
      });
      onCreated(created);
      navigate(`${storePath}/scan/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const bar = (
    <div className="report-bar">
      <button className="link-btn" onClick={() => navigate(storePath)}>
        <ArrowLeft size={13} /> {store.name}
      </button>
      <div className="report-bar-actions">
        <a className="btn" href={scan.url} target="_blank" rel="noreferrer">
          <ExternalLink size={13} /> Deschide pagina
        </a>
        {!running && (
          <button className="btn" onClick={rescan} disabled={busy}>
            {busy ? (
              <LoaderCircle size={13} className="spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Verifică din nou
          </button>
        )}
      </div>
    </div>
  );
  const head = (
    <div className="report-head">
      <p className="eyebrow">PDP – Diagnostic tehnic · {store.name}</p>
      <h1>{host}</h1>
      <p className="report-url" title={scan.url}>
        {scan.url}
      </p>
      <p className="report-meta">
        {dateTime(scan.createdAt)} · {relative(scan.createdAt)}
      </p>
    </div>
  );
  if (running)
    return (
      <>
        {bar}
        {head}
        <ScanProgress
          scan={scan}
          ahead={
            history.filter(
              (s) => s.state === "QUEUED" && s.createdAt < scan.createdAt,
            ).length
          }
        />
      </>
    );

  const r = scan.report;
  const d = r?.diagnostics;
  const features = d?.features ?? [];
  const sum = conclusion(scan, issues, features);
  const count = (statuses: FeatureResult["status"][]) =>
    features.filter((f) => statuses.includes(f.status)).length;
  const issuesIn = (t: Tab) =>
    t === "overview"
      ? issues
      : issues.filter((i) => tabsOf(i.feature).includes(t));
  const pageHistory = history.filter(
    (s) => s.url === scan.url && s.state !== "QUEUED" && s.state !== "RUNNING",
  );

  return (
    <>
      {bar}
      {head}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className={`verdict h-${sum.health}`}>
        <StatusIcon health={sum.health} size={32} />
        <div>
          <h2>{sum.title}</h2>
          <p>{sum.detail}</p>
        </div>
      </div>
      {d && (
        <dl className="audit-counts">
          {(
            [
              [
                "fail",
                "Probleme confirmate",
                issues.filter((i) => i.severity === "problem").length,
              ],
              [
                "warn",
                "Avertizări",
                issues.filter((i) => i.severity === "warning").length,
              ],
              ["ok", "Verificări fără probleme", count(["ok"])],
              ["unknown", "Inconcludente", count(["unknown"])],
              [
                "na",
                "Neexecutate sau indisponibile",
                count(["not_run", "unavailable"]),
              ],
            ] as [Health, string, number][]
          ).map(([h, label, n]) => (
            <div key={label} className={n ? `h-${h}` : "zero"}>
              <dt>{label}</dt>
              <dd>{n}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="tabs" role="tablist">
        {tabs.map((t) => {
          const n = issuesIn(t.id).length;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "tab on" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id !== "overview" && n > 0 && (
                <span className="tab-count alert">{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {!r ? (
        <Card>
          <p>{scan.error ?? "Verificarea nu a produs un rezultat."}</p>
        </Card>
      ) : !d ? (
        <Card>
          <p>
            Această verificare a fost făcută cu o versiune mai veche a
            scannerului, fără diagnostic tehnic. Pornește o verificare nouă.
          </p>
        </Card>
      ) : (
        <>
          {tab === "overview" && (
            <div className="report-grid">
              <div className="report-main">
                <IssueCard
                  title="Probleme identificate"
                  issues={issues}
                  onOpen={setOpen}
                  empty="Nu au fost detectate probleme la verificările efectuate."
                />
                <Card
                  title="Cronologia încărcării"
                  description="De la deschiderea adresei, într-un browser desktop"
                >
                  <Milestones
                    m={d.metrics}
                    threshold={scan.settings.slowThresholdMs}
                  />
                </Card>
              </div>
              <aside className="report-side">
                <Card
                  title="Core Web Vitals"
                  description="Măsurate în laborator, la această verificare"
                >
                  <VitalsRow d={d.metrics} compact />
                </Card>
                <Shot scan={scan} healthy={sum.health === "ok"} />
                <Card
                  title="Istoricul paginii"
                  description={plural(
                    pageHistory.length,
                    "verificare",
                    "verificări",
                  )}
                >
                  <ResultStrip
                    items={[...pageHistory].reverse().map((s) => ({
                      id: s.id,
                      health: scanHealth(s),
                      at: s.createdAt,
                    }))}
                  />
                  <ul className="mini-history">
                    {pageHistory.slice(0, 4).map((s) => (
                      <li key={s.id}>
                        <button
                          className={s.id === scan.id ? "current" : ""}
                          onClick={() => navigate(`${storePath}/scan/${s.id}`)}
                        >
                          <span className={`dot h-${scanHealth(s)}`} />
                          <span>{dateTime(s.createdAt)}</span>
                          <span className="mono">
                            {seconds(s.report?.diagnostics?.metrics.lcp.value)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </aside>
            </div>
          )}

          {tab === "performance" && (
            <>
              <Card
                title="Cronologia încărcării"
                description="Momentele importante ale încărcării paginii"
              >
                <Milestones
                  m={d.metrics}
                  threshold={scan.settings.slowThresholdMs}
                />
              </Card>
              <Card
                title="Core Web Vitals"
                description="Praguri oficiale Google · măsurare de laborator, desktop, fără limitare de rețea"
              >
                <VitalsRow d={d.metrics} />
              </Card>
              <div className="grid-2-1">
                <IssueCard
                  title="Probleme de încărcare și performanță"
                  issues={issuesIn("performance")}
                  onOpen={setOpen}
                  empty="Nu au fost detectate probleme de încărcare sau performanță."
                />
                <Card
                  title="Blocarea browserului"
                  description="Scripturi care țin browserul ocupat"
                >
                  <dl className="kv">
                    <dt>Sarcini lungi</dt>
                    <dd className="mono">{d.counts.longTasks}</dd>
                    <dt>Cea mai lungă blocare</dt>
                    <dd className="mono">
                      {d.metrics.longestTaskMs === null
                        ? "—"
                        : `${d.metrics.longestTaskMs} ms`}
                    </dd>
                    <dt>Timp total de blocare (aprox.)</dt>
                    <dd className="mono">
                      {d.metrics.totalBlockingMs === null
                        ? "—"
                        : `${d.metrics.totalBlockingMs} ms`}
                    </dd>
                  </dl>
                </Card>
              </div>
              <AvailabilityChecks scan={scan} />
              <FeatureList features={features} tab="performance" />
            </>
          )}

          {tab === "network" && (
            <>
              <IssueCard
                title="Erori JavaScript și de rețea"
                issues={issuesIn("network")}
                onOpen={setOpen}
                empty="Nu au fost detectate erori JavaScript sau de rețea."
              />
              <Card
                title="Cererile paginii (waterfall)"
                description={`${d.counts.requests} cereri · ${d.counts.failedRequests} eșuate · observate încă ${seconds(d.settleMs)} după afișarea produsului`}
                flush
              >
                {d.waterfall.length ? (
                  <Waterfall
                    entries={d.waterfall}
                    fcp={d.metrics.fcp.value}
                    lcp={d.metrics.lcp.value}
                  />
                ) : (
                  <p className="card-pad muted-small">
                    Cererile sunt disponibile în raportul complet.
                  </p>
                )}
              </Card>
              <Card
                title="Servicii externe"
                description="Analytics, chat, marketing și alte integrări încărcate de pagină"
                flush
              >
                {d.thirdParties.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Serviciu</th>
                          <th>Tip</th>
                          <th className="num">Cereri</th>
                          <th className="num">Eșuate</th>
                          <th className="num">Cea mai lentă</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.thirdParties.slice(0, 15).map((t) => (
                          <tr key={t.host}>
                            <td className="mono">{t.host}</td>
                            <td className="muted-cell">{t.category}</td>
                            <td className="num mono">{t.requests}</td>
                            <td
                              className={`num mono${t.failures ? " txt-fail" : ""}`}
                            >
                              {t.failures}
                            </td>
                            <td className="num mono">
                              {t.slowestMs === null ? "—" : `${t.slowestMs} ms`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="card-pad muted-small">
                    Pagina nu încarcă servicii externe.
                  </p>
                )}
              </Card>
              <FeatureList features={features} tab="network" />
            </>
          )}

          {tab === "browsers" && (
            <>
              <Card>
                <p className="lead">
                  Această scanare folosește Chromium pe desktop. Comparația
                  între browsere (Firefox, WebKit) și comparația cu scanările
                  anterioare ale paginii vor fi activate în etapele următoare.
                  Până atunci nu afișăm rezultate pentru ele.
                </p>
              </Card>
              <FeatureList features={features} tab="browsers" />
            </>
          )}

          {tab === "experience" && (
            <>
              <Card>
                <div className="sdk-note">
                  <span className="soon-icon">
                    <Plug size={18} />
                  </span>
                  <div>
                    <h3>Necesită scriptul StoreGuard instalat în magazin</h3>
                    <p>
                      Hărțile de click și scroll, clickurile repetate sau fără
                      efect și reluarea sesiunilor se bazează pe vizitatori
                      reali. Ele nu pot fi obținute prin scanarea unei adrese și
                      nu sunt afișate până când scriptul nu este instalat și
                      autorizat în magazin.
                    </p>
                  </div>
                </div>
              </Card>
              <FeatureList features={features} tab="experience" />
            </>
          )}

          {tab === "insights" && (
            <>
              <Card
                title="Probleme cu aceeași sursă"
                description="Grupate după scriptul sau serviciul implicat"
              >
                {d.correlations.length ? (
                  <ul className="corr-list">
                    {d.correlations.map((c) => (
                      <li key={c.source}>
                        <strong className="mono">{c.source}</strong>
                        <span>
                          {plural(c.count, "problemă", "probleme")} ·{" "}
                          {c.features
                            .map((f) => featureDef(f)?.name ?? f)
                            .join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-small">
                    Problemele găsite nu au o sursă comună.
                  </p>
                )}
                <p className="hint-line">
                  Corelarea arată o sursă comună probabilă, nu o cauză
                  confirmată.
                </p>
              </Card>
              <FeatureList features={features} tab="insights" />
            </>
          )}
        </>
      )}
      {open && <IssuePanel issue={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function IssueCard({
  title,
  issues,
  onOpen,
  empty,
}: {
  title: string;
  issues: Finding[];
  onOpen: (f: Finding) => void;
  empty: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? issues : issues.slice(0, 8);
  return (
    <Card
      title={title}
      description={
        issues.length
          ? `${plural(issues.length, "rezultat", "rezultate")} · apasă pentru detalii`
          : undefined
      }
      flush
    >
      {issues.length ? (
        <ul className="issue-list">
          {shown.map((f) => (
            <li key={f.key}>
              <button onClick={() => onOpen(f)}>
                <StatusIcon health={severityHealth(f)} />
                <span className="issue-text">
                  <strong>
                    {f.title}
                    {f.count > 1 && <em> · de {f.count} ori</em>}
                  </strong>
                  <span>{f.summary}</span>
                  {f.where && <small>{f.where}</small>}
                </span>
                {f.thirdParty && <span className="tag">Serviciu extern</span>}
                <ChevronRight size={14} className="chev" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card-pad ok-line">
          <StatusIcon health="ok" size={16} /> {empty}
        </div>
      )}
      {issues.length > 8 && (
        <button className="link-btn list-more" onClick={() => setAll(!all)}>
          {all ? "Arată mai puține" : `Arată toate cele ${issues.length}`}
        </button>
      )}
    </Card>
  );
}

function IssuePanel({
  issue,
  onClose,
}: {
  issue: Finding;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const def = featureDef(issue.feature);
  return (
    <>
      <div className="panel-scrim" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label={issue.title}>
        <header className="panel-head">
          <StatusPill
            health={severityHealth(issue)}
            label={
              issue.severity === "problem"
                ? "Problemă confirmată"
                : "Avertizare"
            }
          />
          <button
            className="icon-btn"
            aria-label="Închide detaliile"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <h2 className="panel-title">{issue.title}</h2>
        <p className="panel-summary">{issue.summary}</p>
        <dl className="kv panel-kv">
          {issue.where && (
            <>
              <dt>Unde</dt>
              <dd className="break">{issue.where}</dd>
            </>
          )}
          {issue.atMs !== null && (
            <>
              <dt>Când</dt>
              <dd>la {seconds(issue.atMs)} de la deschiderea paginii</dd>
            </>
          )}
          <dt>Apariții</dt>
          <dd>
            {issue.count === 1
              ? "o dată, în această verificare"
              : `de ${issue.count} ori, în această verificare`}
          </dd>
          <dt>Sursă</dt>
          <dd>
            {issue.thirdParty
              ? `Serviciu extern${issue.source ? ` (${issue.source})` : ""}`
              : "Magazinul"}
          </dd>
          <dt>Verificare</dt>
          <dd>{def?.name ?? issue.feature}</dd>
          <dt>Certitudine</dt>
          <dd>
            {issue.severity === "problem"
              ? "Confirmată prin efect observat în pagină."
              : "Semnal tehnic real; impactul asupra clientului nu a fost confirmat."}
          </dd>
        </dl>
        {issue.action && (
          <div className="check-action h-warn">
            <Wrench size={13} />
            <div>
              <strong>Ce poți face</strong>
              <p>{issue.action}</p>
            </div>
          </div>
        )}
        <details className="dev">
          <summary>Detalii tehnice pentru dezvoltator</summary>
          <pre>{JSON.stringify(issue.technical, null, 2)}</pre>
        </details>
      </aside>
    </>
  );
}

function FeatureList({
  features,
  tab,
}: {
  features: FeatureResult[];
  tab: DiagnosticTab;
}) {
  const [all, setAll] = useState(false);
  const list = pdpFeatures
    .filter((f) => f.tabs.includes(tab))
    .map((def) => ({ def, res: features.find((f) => f.id === def.id) }));
  const attention = list.filter(
    ({ res }) => res && ["fail", "warn", "unknown"].includes(res.status),
  );
  const shown = all || !attention.length ? list : attention;
  const rest = list.length - attention.length;
  return (
    <Card
      title="Verificări din această secțiune"
      description={`${list.length} verificări · ${attention.length ? plural(attention.length, "necesită atenție", "necesită atenție") : "niciuna nu necesită atenție"}`}
      flush
    >
      <ul className="feature-list">
        {shown.map(({ def, res }) => {
          const h = res ? featureHealth(res.status) : "na";
          return (
            <li key={def.id}>
              <StatusIcon health={h} size={16} />
              <span className="feature-text">
                <strong>{def.name}</strong>
                <span>{res?.summary ?? def.short}</span>
              </span>
              <span className={`feature-state h-${h}`}>{healthLabel[h]}</span>
            </li>
          );
        })}
      </ul>
      {attention.length > 0 && rest > 0 && (
        <button className="link-btn list-more" onClick={() => setAll(!all)}>
          {all
            ? "Arată doar ce necesită atenție"
            : `Arată și celelalte ${rest} verificări`}
        </button>
      )}
    </Card>
  );
}

function AvailabilityChecks({ scan }: { scan: Scan }) {
  const [expanded, setExpanded] = useState(false);
  const r = scan.report;
  if (!r) return null;
  const items = r.rules
    .map((rule) => ({
      rule,
      info: explainRule(rule, r.observation, scan.settings),
    }))
    .sort(
      (a, b) =>
        ruleOrder.indexOf(a.info.health) - ruleOrder.indexOf(b.info.health),
    );
  const allOk = items.every(({ info }) => info.health === "ok");
  if (allOk && !expanded)
    return (
      <Card
        title="Disponibilitate și afișare"
        description="Verificările de bază ale paginii"
      >
        <div className="ok-line">
          <StatusIcon health="ok" size={16} /> Toate cele {items.length}{" "}
          verificări de bază au trecut: pagina se deschide, produsul există,
          conținutul se afișează complet și fără mesaje de eroare.
          <button className="link-btn push" onClick={() => setExpanded(true)}>
            Detalii
          </button>
        </div>
      </Card>
    );
  return (
    <Card
      title="Disponibilitate și afișare"
      description="Verificările de bază ale paginii"
      flush
    >
      <ul className="checks">
        {items.map(({ rule, info }) => (
          <li key={rule.id} className={`check-row h-${info.health}`}>
            <details>
              <summary>
                <StatusIcon health={info.health} />
                <span className="check-text">
                  <strong>{info.title}</strong>
                  <span>{info.summary}</span>
                </span>
                <StatusPill health={info.health} />
                <ChevronDown size={14} className="chev" />
              </summary>
              <div className="check-body">
                {info.action && (
                  <div className="check-action">
                    <Wrench size={13} />
                    <div>
                      <strong>Ce poți face</strong>
                      <p>{info.action}</p>
                    </div>
                  </div>
                )}
                <details className="dev">
                  <summary>Detalii tehnice</summary>
                  <pre>{JSON.stringify(rule.technical, null, 2)}</pre>
                </details>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Shot({ scan, healthy }: { scan: Scan; healthy: boolean }) {
  return (
    <Card title="Captura paginii" flush>
      {scan.report?.observation.screenshot ? (
        <a
          className="shot"
          href={`/api/scans/${scan.id}/screenshot`}
          target="_blank"
          rel="noreferrer"
        >
          <img
            alt="Captură a paginii observate în timpul verificării"
            src={`/api/scans/${scan.id}/screenshot`}
          />
        </a>
      ) : (
        <div className="shot-empty">
          <ImageOff size={16} />
          {healthy
            ? "Captura se salvează doar când există o problemă de arătat."
            : "Pentru această verificare nu a putut fi salvată o captură."}
        </div>
      )}
    </Card>
  );
}
