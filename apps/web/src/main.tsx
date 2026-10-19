import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Checkbox from "@radix-ui/react-checkbox";
import {
  ShieldCheck,
  LayoutDashboard,
  ScanLine,
  History,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  Check,
  Plus,
  Globe2,
  Clock3,
  AlertTriangle,
  Activity,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Menu,
  X,
  Layers3,
} from "lucide-react";
import {
  defaults,
  type Scan,
  type Settings,
  type Verdict,
} from "../../../packages/contracts/src/index";
import "./style.css";
const stateLabels: Record<string, string> = {
  QUEUED: "În coadă",
  RUNNING: "Se scanează",
  COMPLETED: "Finalizată",
  BLOCKED: "Evaluare blocată",
  FAILED: "Scanare eșuată",
  PASS: "Fără probleme detectate",
  FAIL: "Problemă confirmată",
  WARNING: "Necesită atenție",
  INCONCLUSIVE: "Rezultat inconcludent",
  NOT_APPLICABLE: "Nu se aplică",
};
const date = (value: string) =>
  new Date(value).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const duration = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "Nedeterminat"
    : `${(value / 1000).toFixed(2)} s`;
const issueCount = (scan: Scan) =>
  scan.report?.rules.filter((r) => r.status === "FAIL").length ?? 0;
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Cererea nu a putut fi procesată.");
  return data;
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      {["QUEUED", "RUNNING"].includes(status) ? (
        <LoaderCircle size={12} className="spin" />
      ) : (
        <span className="badge-dot" />
      )}
      {stateLabels[status] ?? status}
    </span>
  );
}
function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/"),
    [scans, setScans] = useState<Scan[]>([]),
    [settings, setSettings] = useState<Settings>(defaults),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [mobile, setMobile] = useState(false);
  const navigate = (path: string) => {
    location.hash = path;
    setMobile(false);
  };
  useEffect(() => {
    const listener = () => setRoute(location.hash.slice(1) || "/");
    addEventListener("hashchange", listener);
    return () => removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await api<Scan[]>("/scans");
        if (active) {
          setScans(data);
          setLoaded(true);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 1500);
    void api<Settings>("/settings")
      .then(setSettings)
      .catch(() => {});
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const selected = route.startsWith("/scan/")
    ? scans.find((s) => s.id === route.split("/")[2])
    : null;
  const title =
    route === "/new"
      ? "Scanare nouă"
      : route === "/history"
        ? "Istoric scanări"
        : route === "/settings"
          ? "Setări scanare"
          : route.startsWith("/scan/")
            ? "Raport de scanare"
            : "Privire de ansamblu";
  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a className="brand" href="#/">
          <span className="brand-icon">
            <ShieldCheck size={24} />
          </span>
          StoreGuard<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">SG</span>
          <div>
            <strong>Spațiul meu de lucru</strong>
            <small>Instanță locală</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {[
            { path: "/", label: "Dashboard", icon: LayoutDashboard },
            { path: "/new", label: "Scanare nouă", icon: ScanLine },
            { path: "/history", label: "Istoric scanări", icon: History },
          ].map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              className={route === path ? "nav-item active" : "nav-item"}
              onClick={() => navigate(path)}
            >
              <Icon size={19} />
              {label}
              {path === "/new" && <Plus size={14} className="nav-end" />}
            </button>
          ))}
        </nav>
        <p className="nav-label modules-label">
          MODULE DE AUDIT <span>01</span>
        </p>
        <div className="module-item">
          <span className="module-dot" />
          <div>
            <strong>Disponibilitate & încărcare</strong>
            <small>Pagină de produs · v1.0</small>
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span />
            Scanner local<div>Chromium · scanări manuale</div>
          </div>
          <button
            className={route === "/settings" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("/settings")}
          >
            <Settings2 size={18} />
            Setări scanare
          </button>
          <div className="profile">
            <span>O</span>
            <div>
              <strong>OptiSell</strong>
              <small>Instanță individuală</small>
            </div>
          </div>
        </div>
      </aside>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
      <main className="main">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu"
              aria-label="Deschide meniul"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span> <strong>{title}</strong>
            </span>
          </div>
          <span className="environment">
            <span />
            Mediu local
          </span>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <p className="eyebrow">PRODUCT PAGE MONITORING</p>
              <h1>{title}</h1>
              <p className="subtitle">
                {route === "/"
                  ? "Vezi dacă paginile tale de produs sunt accesibile și se încarcă corect."
                  : route === "/new"
                    ? "Verifică o pagină reală, într-o sesiune Chromium izolată."
                    : route === "/settings"
                      ? "Configurează pragurile și semnalele specifice magazinului."
                      : "Rezultate reale, explicații și dovezi pentru fiecare verificare."}
              </p>
            </div>
            {route !== "/new" && (
              <button
                className="button primary"
                onClick={() => navigate("/new")}
              >
                <Plus size={17} />
                Scanare nouă
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="error-banner">
              <AlertTriangle size={18} />
              {error} Verifică dacă API-ul rulează pe portul 4310.
            </div>
          )}
          {!loaded && !error ? (
            <div className="panel empty">
              <LoaderCircle className="spin" />
              Se încarcă datele locale…
            </div>
          ) : route === "/new" ? (
            <NewScan
              navigate={navigate}
              onCreated={(scan) =>
                setScans((current) => [
                  scan,
                  ...current.filter((item) => item.id !== scan.id),
                ])
              }
            />
          ) : route === "/settings" ? (
            <SettingsPage settings={settings} onSave={setSettings} />
          ) : route.startsWith("/scan/") ? (
            selected ? (
              <Result scan={selected} />
            ) : (
              <div className="panel empty">
                {loaded
                  ? "Scanarea nu a fost găsită în istoricul recent."
                  : "Se încarcă raportul…"}
              </div>
            )
          ) : route === "/history" ? (
            <HistoryTable scans={scans} navigate={navigate} />
          ) : (
            <Dashboard scans={scans} navigate={navigate} />
          )}
          <footer>
            <span>
              <ShieldCheck size={13} />
              StoreGuard · PDP Availability & Loading
            </span>
            <span>Motor v1.0 · 7 verificări</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
function Dashboard({
  scans,
  navigate,
}: {
  scans: Scan[];
  navigate: (path: string) => void;
}) {
  const completed = scans.filter((s) => s.report),
    issues = completed.reduce((n, s) => n + issueCount(s), 0),
    bad = completed.filter((s) => issueCount(s) > 0).length,
    last = scans[0];
  return (
    <>
      <div className="stats-grid">
        {[
          {
            label: "Scanări efectuate",
            value: completed.length,
            icon: ScanLine,
            note: `${scans.filter((s) => ["QUEUED", "RUNNING"].includes(s.state)).length} scanări în așteptare sau în curs`,
            color: "blue",
          },
          {
            label: "Probleme confirmate",
            value: issues,
            icon: AlertTriangle,
            note: "Verificări cu rezultat FAIL",
            color: "orange",
          },
          {
            label: "Scanări cu probleme",
            value: bad,
            icon: Activity,
            note: "Cel puțin o problemă confirmată",
            color: "purple",
          },
          {
            label: "Ultima scanare",
            value: last ? date(last.createdAt) : "—",
            icon: Clock3,
            note: last
              ? new URL(last.url).hostname
              : "Nu ai efectuat încă o scanare",
            color: "green",
          },
        ].map(({ label, value, icon: Icon, note, color }) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              {label}
              <span className={`stat-icon ${color}`}>
                <Icon size={18} />
              </span>
            </div>
            <strong
              className={
                label === "Ultima scanare"
                  ? "stat-value date-value"
                  : "stat-value"
              }
            >
              {value}
            </strong>
            <p>{note}</p>
          </div>
        ))}
      </div>
      <div className="intro-panel">
        <div className="intro-visual">
          <ShieldCheck size={39} />
          <span className="visual-dot one" />
          <span className="visual-dot two" />
        </div>
        <div className="intro-copy">
          <span className="mini-label">PRIMUL TĂU MODUL DE AUDIT</span>
          <h2>O pagină accesibilă. Un client mai aproape.</h2>
          <p>
            Verifică disponibilitatea, randarea și încărcarea paginii de produs.
            Fiecare rezultat are o explicație și semnale tehnice verificabile.
          </p>
          <button className="button primary" onClick={() => navigate("/new")}>
            Scanează o pagină <ArrowRight size={16} />
          </button>
        </div>
        <div className="intro-features">
          <span>
            <Check size={15} />
            Navigare reală cu Chromium
          </span>
          <span>
            <Check size={15} />
            Fără instalare în magazin
          </span>
          <span>
            <Check size={15} />
            Fără acțiuni comerciale
          </span>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>
            Scanări recente <span className="count">{scans.length}</span>
          </h2>
          <p>Istoricul verificărilor pentru paginile tale de produs.</p>
        </div>
        <button className="text-button" onClick={() => navigate("/history")}>
          Vezi tot istoricul <ArrowUpRight size={16} />
        </button>
      </div>
      <HistoryTable scans={scans.slice(0, 5)} navigate={navigate} />
      <div className="module-summary">
        <span className="stat-icon blue">
          <Layers3 size={20} />
        </span>
        <div>
          <h3>Disponibilitate & încărcare</h3>
          <p>
            HTTP · pagină goală · încărcare persistentă · redirecturi · erori
            afișate · timpi de randare
          </p>
        </div>
        <span className="module-version">MODUL ACTIV</span>
      </div>
    </>
  );
}
function HistoryTable({
  scans,
  navigate,
}: {
  scans: Scan[];
  navigate: (path: string) => void;
}) {
  return (
    <div className="panel table-panel">
      {!scans.length ? (
        <div className="empty">
          <span className="empty-icon">
            <ScanLine size={27} />
          </span>
          <h3>Primul audit începe cu un URL</h3>
          <p>
            Introdu adresa unui produs. Aici vei găsi rezultatele scanărilor
            tale reale.
          </p>
          <button className="button secondary" onClick={() => navigate("/new")}>
            Creează prima scanare <ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PAGINĂ DE PRODUS</th>
                <th>DATA SCANĂRII</th>
                <th>CONȚINUT UTILIZABIL</th>
                <th>PROBLEME</th>
                <th>REZULTAT</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => (
                <tr key={scan.id}>
                  <td>
                    <div className="url-cell">
                      <span className="site-icon">
                        <Globe2 size={17} />
                      </span>
                      <div>
                        <strong>{new URL(scan.url).hostname}</strong>
                        <small title={scan.url}>
                          {new URL(scan.url).pathname}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>{date(scan.createdAt)}</td>
                  <td>{duration(scan.report?.observation.usableMs)}</td>
                  <td>
                    <span
                      className={issueCount(scan) ? "issue-count" : "muted"}
                    >
                      {scan.report ? issueCount(scan) : "—"}
                    </span>
                  </td>
                  <td>
                    <Badge status={scan.report?.verdict ?? scan.state} />
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label="Deschide raportul"
                      onClick={() => navigate(`/scan/${scan.id}`)}
                    >
                      <ArrowUpRight size={19} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function NewScan({
  navigate,
  onCreated,
}: {
  navigate: (path: string) => void;
  onCreated: (scan: Scan) => void;
}) {
  const [url, setUrl] = useState(""),
    [expectedActive, setExpected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const scan = await api<Scan>("/scans", {
        method: "POST",
        body: JSON.stringify({ url, expectedActive }),
      });
      onCreated(scan);
      navigate(`/scan/${scan.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="form-layout">
      <form className="panel form-panel" onSubmit={submit}>
        <span className="stat-icon blue">
          <ScanLine size={23} />
        </span>
        <h2>Ce pagină verificăm?</h2>
        <p className="muted">
          Introdu adresa publică a unui produs din magazinul tău.
        </p>
        <label htmlFor="product-url">URL pagină de produs</label>
        <div className="input-with-icon">
          <Globe2 size={18} />
          <input
            id="product-url"
            type="url"
            required
            maxLength={2048}
            placeholder="https://magazin.ro/produs/exemplu"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
        </div>
        <p className="field-help">
          Doar HTTP / HTTPS. Adresele private și locale sunt blocate.
        </p>
        <label className="checkbox-label">
          <Checkbox.Root
            className="checkbox"
            checked={expectedActive}
            onCheckedChange={(value) => setExpected(value === true)}
          >
            <Checkbox.Indicator>
              <Check size={14} />
            </Checkbox.Indicator>
          </Checkbox.Root>
          <span>
            Acest produs ar trebui să fie activ și accesibil
            <small>
              Confirmi că un răspuns 404 / 410 reprezintă o problemă.
            </small>
          </span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="button primary full" type="submit">
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <ScanLine size={18} />
          )}
          Scanează pagina
        </button>
        <p className="form-footnote">
          Scanare manuală · maximum 45 secunde cu setările implicite
        </p>
      </form>
      <div className="panel info-panel">
        <h3>Ce verifică acest modul</h3>
        {[
          "Disponibilitatea paginii și răspunsul HTTP",
          "Conținutul randat în browser",
          "Loaderul persistent și redirecturile",
          "Erorile afișate cu HTTP 200",
          "Timpul până la conținut utilizabil",
        ].map((text) => (
          <p key={text}>
            <Check size={16} />
            {text}
          </p>
        ))}
        <div className="notice">
          <ShieldCheck size={19} />
          <span>
            Scannerul nu apasă butoane și nu plasează comenzi. Sesiunea este
            izolată și nu folosește conturi ale magazinului.
          </span>
        </div>
      </div>
    </div>
  );
}
function Result({ scan }: { scan: Scan }) {
  const r = scan.report,
    o = r?.observation;
  if (!r)
    return (
      <div className="panel empty">
        {["RUNNING", "QUEUED"].includes(scan.state) ? (
          <>
            <LoaderCircle size={30} className="spin" />
            <h2>{stateLabels[scan.state]}</h2>
            <p>
              {scan.state === "QUEUED"
                ? "Scanarea așteaptă un loc disponibil."
                : "Chromium verifică navigarea și randarea paginii."}
            </p>
            <span className="scan-url">{scan.url}</span>
            <p className="muted">Raportul se actualizează automat.</p>
          </>
        ) : (
          <>
            <AlertTriangle size={30} />
            <h2>Scanarea nu a fost finalizată</h2>
            <p>{scan.error}</p>
          </>
        )}
      </div>
    );
  return (
    <>
      <div className="panel report-summary">
        <div>
          <span className="mini-label">RAPORT PAGINĂ DE PRODUS</span>
          <h2 className="report-url">{scan.url}</h2>
          <p className="muted">
            {date(scan.createdAt)} · {stateLabels[scan.state]} · {scan.id}
          </p>
        </div>
        <Badge status={r.verdict} />
      </div>
      <div className="metrics-row">
        {[
          ["HTTP principal", o?.httpStatus ?? "Nedisponibil"],
          ["Conținut utilizabil", duration(o?.usableMs)],
          ["DOMContentLoaded", duration(o?.domContentLoadedMs)],
          ["Durată totală scanare", duration(o?.totalMs)],
        ].map(([name, value]) => (
          <div className="panel mini-metric" key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {(o?.environmentError || o?.samples.at(-1)?.blocked) && (
        <div className="notice">
          <AlertTriangle size={19} />
          <span>
            {o.environmentError ?? o.samples.at(-1)?.blocked} Rezultatele nu
            confirmă un defect al magazinului.
          </span>
        </div>
      )}
      {o && o.blockedRequests > 0 && (
        <div className="notice">
          <ShieldCheck size={18} />
          <span>
            {o.blockedRequests} cereri au fost blocate de politica scannerului.
            Randarea poate fi influențată; consultă detaliile tehnice.
          </span>
        </div>
      )}
      <div className="section-heading">
        <div>
          <h2>Rezultatele verificărilor</h2>
          <p>Explicații și dovezi pentru cele șapte reguli ale modulului.</p>
        </div>
      </div>
      {(
        [
          "FAIL",
          "WARNING",
          "INCONCLUSIVE",
          "PASS",
          "NOT_APPLICABLE",
        ] as Verdict[]
      )
        .filter((status) => r.rules.some((rule) => rule.status === status))
        .map((status) => (
          <section className="rule-group" key={status}>
            <h3>
              {stateLabels[status]}{" "}
              <span className="count">
                {r.rules.filter((rule) => rule.status === status).length}
              </span>
            </h3>
            {r.rules
              .filter((rule) => rule.status === status)
              .map((rule) => (
                <article className="panel rule-card" key={rule.id}>
                  <div className="rule-heading">
                    <div>
                      <code>{rule.id}</code>
                      <h3>{rule.name}</h3>
                    </div>
                    <Badge status={rule.status} />
                  </div>
                  <p>{rule.explanation}</p>
                  <details>
                    <summary>
                      Detalii tehnice și dovezi <ChevronDown size={14} />
                    </summary>
                    <pre>{JSON.stringify(rule.technical, null, 2)}</pre>
                  </details>
                </article>
              ))}
          </section>
        ))}
      <div className="report-bottom">
        <div className="panel details-panel">
          <h3>Navigare și configurație</h3>
          <dl>
            <dt>URL final</dt>
            <dd>{o?.finalUrl}</dd>
            <dt>Durată navigare</dt>
            <dd>{duration(o?.navigationMs)}</dd>
            <dt>Cauză navigare</dt>
            <dd>{o?.navigationError ?? "Nicio eroare observată"}</dd>
            <dt>Versiuni</dt>
            <dd>
              Motor {r.engineVersion} · reguli {r.rulesVersion}
            </dd>
          </dl>
          <details>
            <summary>
              Lanț redirecturi și setări <ChevronDown size={14} />
            </summary>
            <pre>
              {JSON.stringify(
                { redirects: o?.redirects, settings: scan.settings },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
        <div className="panel screenshot-panel">
          <h3>Captură de ecran</h3>
          {o?.screenshot ? (
            <a
              href={`/api/scans/${scan.id}/screenshot`}
              target="_blank"
              rel="noreferrer"
            >
              <img
                alt="Captură a paginii observate în timpul scanării"
                src={`/api/scans/${scan.id}/screenshot`}
              />
              <span>
                Deschide captura <ExternalLink size={13} />
              </span>
            </a>
          ) : (
            <div className="screenshot-empty">
              Nu a fost colectată o captură pentru această scanare.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
function SettingsPage({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const [draft, setDraft] = useState(settings),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const change = (key: keyof Settings, value: unknown) => {
    setDraft({ ...draft, [key]: value });
    setSaved(false);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const value = await api<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...draft,
          errorMessages: draft.errorMessages
            .map((m) => m.trim())
            .filter(Boolean),
        }),
      });
      onSave(value);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <form className="panel settings-panel" onSubmit={submit}>
      <h2>Praguri de scanare</h2>
      <p className="muted">
        Valorile sunt repere de testare configurabile, nu standarde universale
        de performanță. Se aplică scanărilor viitoare.
      </p>
      <div className="settings-grid">
        {[
          {
            key: "navigationTimeoutMs",
            label: "Timeout navigare (ms)",
            min: 200,
            max: 30000,
          },
          {
            key: "renderTimeoutMs",
            label: "Timeout randare (ms)",
            min: 400,
            max: 30000,
          },
          {
            key: "slowThresholdMs",
            label: "Prag încărcare lentă (ms)",
            min: 100,
            max: 30000,
          },
          {
            key: "globalTimeoutMs",
            label: "Timeout global (ms)",
            min: 1000,
            max: 60000,
          },
          {
            key: "maxRedirects",
            label: "Număr maxim redirecturi",
            min: 1,
            max: 20,
          },
        ].map(({ key, label, min, max }) => (
          <div key={key}>
            <label htmlFor={key}>{label}</label>
            <input
              id={key}
              type="number"
              required
              min={min}
              max={max}
              value={draft[key as keyof Settings] as number}
              onChange={(e) =>
                change(key as keyof Settings, Number(e.target.value))
              }
            />
          </div>
        ))}
      </div>
      <div className="divider" />
      <h2>Semnale specifice magazinului</h2>
      <div className="settings-grid">
        {[
          {
            key: "loaderSelector",
            label: "Selector CSS pentru loader",
            placeholder: ".product-loader",
          },
          {
            key: "errorSelector",
            label: "Selector CSS pentru eroare",
            placeholder: ".product-error",
          },
          {
            key: "expectedDomain",
            label: "Domeniu așteptat (opțional)",
            placeholder: "magazin.ro",
          },
          {
            key: "expectedUrl",
            label: "Destinație finală așteptată (opțional)",
            placeholder: "https://magazin.ro/produs/exemplu",
          },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label htmlFor={key}>{label}</label>
            <input
              id={key}
              placeholder={placeholder}
              value={draft[key as keyof Settings] as string}
              onChange={(e) => change(key as keyof Settings, e.target.value)}
            />
          </div>
        ))}
      </div>
      <label htmlFor="errorMessages">
        Mesaje specifice de eroare (un mesaj pe rând)
      </label>
      <textarea
        id="errorMessages"
        rows={4}
        value={draft.errorMessages.join("\n")}
        onChange={(e) => change("errorMessages", e.target.value.split("\n"))}
      />
      <p className="field-help">
        Selectorii trebuie să fie CSS valid. Mesajele se caută în conținut
        vizibil și contextual.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="save-success">
          <Check size={16} />
          Setările au fost salvate.
        </p>
      )}
      <button className="button primary" type="submit">
        Salvează setările
      </button>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
