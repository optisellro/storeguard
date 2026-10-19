import { useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  Wrench,
} from "lucide-react";
import type { Scan } from "../../../../packages/contracts/src/index";
import { Card, StatusIcon, StatusPill } from "../components/ui";
import { LoadTimeline, ResultStrip } from "../components/charts";
import { ScanProgress } from "../components/ScanProgress";
import {
  explainRule,
  ruleCopy,
  ruleOrder,
  scanHealth,
  summarize,
  type Health,
} from "../lib/report";
import { api } from "../lib/api";
import { dateTime, plural, relative, seconds, splitUrl } from "../lib/format";
import { PDP_MODULE } from "../app/navigation";

const countLabel: Partial<Record<Health, string>> = {
  ok: "Trecute",
  fail: "Probleme",
  warn: "Atenție",
  unknown: "Neverificate",
};

export function Report({
  scan,
  scans,
  navigate,
  onCreated,
}: {
  scan: Scan;
  scans: Scan[];
  navigate: (path: string) => void;
  onCreated: (scan: Scan) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { host } = splitUrl(scan.url);
  const rescan = async () => {
    setBusy(true);
    setError("");
    try {
      const created = await api<Scan>("/scans", {
        method: "POST",
        body: JSON.stringify({
          url: scan.url,
          expectedActive: scan.expectedActive,
        }),
      });
      onCreated(created);
      navigate(`/scan/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const top = (
    <div className="report-bar">
      <button className="link-btn" onClick={() => navigate(PDP_MODULE.path)}>
        <ArrowLeft size={13} /> {PDP_MODULE.label}
      </button>
      <div className="report-bar-actions">
        <a className="btn" href={scan.url} target="_blank" rel="noreferrer">
          <ExternalLink size={13} /> Deschide pagina
        </a>
        {scan.state !== "QUEUED" && scan.state !== "RUNNING" && (
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
      <p className="eyebrow">Raport verificare · {PDP_MODULE.label}</p>
      <h1>{host}</h1>
      <p className="report-url" title={scan.url}>
        {scan.url}
      </p>
      <p className="report-meta">
        {dateTime(scan.createdAt)} · {relative(scan.createdAt)}
        {scan.expectedActive && " · produs declarat activ"}
      </p>
    </div>
  );

  if (scan.state === "QUEUED" || scan.state === "RUNNING") {
    const ahead = scans.filter(
      (s) => s.state === "QUEUED" && s.createdAt < scan.createdAt,
    ).length;
    return (
      <>
        {top}
        {head}
        <ScanProgress scan={scan} ahead={ahead} />
      </>
    );
  }

  const r = scan.report;
  const summary = summarize(scan);
  if (!r)
    return (
      <>
        {top}
        {head}
        <div className={`verdict h-${summary.health}`}>
          <StatusIcon health={summary.health} size={32} />
          <div>
            <h2>{summary.title}</h2>
            <p>{summary.detail}</p>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </>
    );

  const o = r.observation;
  const items = r.rules
    .map((rule) => ({ rule, info: explainRule(rule, o, scan.settings) }))
    .sort(
      (a, b) =>
        ruleOrder.indexOf(a.info.health) - ruleOrder.indexOf(b.info.health),
    );
  const count = (h: Health) => items.filter((i) => i.info.health === h).length;
  const history = scans
    .filter(
      (s) =>
        s.url === scan.url && s.state !== "QUEUED" && s.state !== "RUNNING",
    )
    .slice(0, 20)
    .reverse();

  return (
    <>
      {top}
      {head}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className={`verdict h-${summary.health}`}>
        <StatusIcon health={summary.health} size={32} />
        <div>
          <h2>{summary.title}</h2>
          <p>{summary.detail}</p>
        </div>
        <dl className="verdict-counts">
          {(["ok", "fail", "warn", "unknown"] as Health[]).map((h) => (
            <div key={h} className={count(h) ? `h-${h}` : "zero"}>
              <dt>{countLabel[h]}</dt>
              <dd>{count(h)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="report-grid">
        <div className="report-main">
          <Card
            title="Verificări efectuate"
            description={`${plural(items.length, "verificare", "verificări")} pentru această pagină. Apasă pe un rând pentru detalii.`}
            flush
          >
            <ul className="checks">
              {items.map(({ rule, info }) => (
                <li key={rule.id} className={`check-row h-${info.health}`}>
                  <details
                    open={info.health === "fail" || info.health === "warn"}
                  >
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
                      <p className="check-what">
                        <strong>Ce verificăm:</strong>{" "}
                        {ruleCopy[rule.id]?.checks ?? rule.name}
                      </p>
                      <details className="dev">
                        <summary>Detalii tehnice · {rule.id}</summary>
                        <p>{rule.explanation}</p>
                        <pre>{JSON.stringify(rule.technical, null, 2)}</pre>
                      </details>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Detalii pentru echipa tehnică" className="tech-card">
            <details className="dev">
              <summary>Afișează datele tehnice ale verificării</summary>
              <dl className="tech-list">
                <dt>Cod răspuns server</dt>
                <dd className="mono">{o.httpStatus ?? "fără răspuns"}</dd>
                <dt>Adresă finală</dt>
                <dd className="mono break">{o.finalUrl}</dd>
                <dt>Redirecționări</dt>
                <dd>
                  {o.redirects.length > 1 ? (
                    <ol className="redirects">
                      {o.redirects.map((hop, i) => (
                        <li key={i} className="mono break">
                          <b>{hop.status}</b> {hop.url}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    "Niciuna"
                  )}
                </dd>
                <dt>Eroare navigare</dt>
                <dd className="mono">{o.navigationError ?? "—"}</dd>
                <dt>Eroare analiză</dt>
                <dd className="mono">{o.analysisError ?? "—"}</dd>
                <dt>Navigare / DOMContentLoaded</dt>
                <dd className="mono">
                  {seconds(o.navigationMs)} / {seconds(o.domContentLoadedMs)}
                </dd>
                <dt>Durată totală verificare</dt>
                <dd className="mono">{seconds(o.totalMs)}</dd>
                <dt>Cereri blocate de scanner</dt>
                <dd className="mono">
                  {o.blockedRequests}
                  {o.blockedRequests > 0 && (
                    <span className="hint">
                      {" "}
                      · cereri externe oprite din motive de securitate
                    </span>
                  )}
                </dd>
                <dt>Observații</dt>
                <dd className="mono">{o.samples.length}</dd>
                <dt>Versiuni</dt>
                <dd className="mono">
                  motor {r.engineVersion} · reguli {r.rulesVersion}
                </dd>
                <dt>ID verificare</dt>
                <dd className="mono">{scan.id}</dd>
              </dl>
              <pre>{JSON.stringify(scan.settings, null, 2)}</pre>
            </details>
          </Card>
        </div>
        <aside className="report-side">
          <Card title="Captura paginii" flush>
            {o.screenshot ? (
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
                {summary.health === "ok"
                  ? "Captura se salvează doar când există o problemă de arătat."
                  : "Pentru această verificare nu a putut fi salvată o captură."}
              </div>
            )}
          </Card>
          <Card title="Încărcare" description="De la deschiderea adresei">
            <LoadTimeline
              domMs={o.domContentLoadedMs}
              navigationMs={o.navigationMs}
              usableMs={o.usableMs}
              threshold={scan.settings.slowThresholdMs}
            />
          </Card>
          <Card
            title="Istoricul paginii"
            description={plural(history.length, "verificare", "verificări")}
          >
            <ResultStrip
              items={history.map((s) => ({
                id: s.id,
                health: scanHealth(s),
                at: s.createdAt,
              }))}
            />
            <ul className="mini-history">
              {[...history]
                .reverse()
                .slice(0, 4)
                .map((s) => (
                  <li key={s.id}>
                    <button
                      className={s.id === scan.id ? "current" : ""}
                      onClick={() => navigate(`/scan/${s.id}`)}
                    >
                      <span className={`dot h-${scanHealth(s)}`} />
                      <span>{dateTime(s.createdAt)}</span>
                      <span className="mono">
                        {seconds(s.report?.observation.usableMs)}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
