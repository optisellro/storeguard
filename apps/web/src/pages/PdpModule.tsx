import { ChevronRight, PackageSearch, Check, Minus } from "lucide-react";
import type { Scan, Settings } from "../../../../packages/contracts/src/index";
import { Card, Empty, Metric, PageHeader, StatusPill } from "../components/ui";
import { ResultStrip } from "../components/charts";
import { PdpOverview } from "./PdpOverview";
import { HistoryTab } from "./HistoryTab";
import { SettingsPage } from "./SettingsPage";
import { latestPerPage } from "../lib/stats";
import { ruleCopy, scanHealth, summarize } from "../lib/report";
import { dateTime, relative, seconds, splitUrl } from "../lib/format";
import { PDP_MODULE, pdpTabs, type PdpTab } from "../app/navigation";

export function PdpModule({
  tab,
  scans,
  settings,
  onSaveSettings,
  navigate,
}: {
  tab: PdpTab;
  scans: Scan[];
  settings: Settings;
  onSaveSettings: (s: Settings) => void;
  navigate: (path: string) => void;
}) {
  const pages = latestPerPage(scans);
  const healths = pages.map(scanHealth);
  const counts: Partial<Record<PdpTab, number>> = {
    pages: pages.length,
    history: scans.length,
  };
  return (
    <>
      <PageHeader
        title={PDP_MODULE.title}
        description={PDP_MODULE.description}
      />
      <div className="tabs" role="tablist">
        {pdpTabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab on" : "tab"}
            onClick={() => navigate(t.path)}
          >
            {t.label}
            {counts[t.id] !== undefined && (
              <span className="tab-count">{counts[t.id]}</span>
            )}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <PdpOverview scans={scans} settings={settings} navigate={navigate} />
      )}
      {tab === "pages" && (
        <>
          <div className="metrics">
            <Metric label="Pagini verificate" value={pages.length} />
            <Metric
              label="Funcționează"
              value={healths.filter((h) => h === "ok").length}
              tone="ok"
            />
            <Metric
              label="Cu probleme"
              value={healths.filter((h) => h === "fail" || h === "warn").length}
              tone="fail"
            />
            <Metric
              label="Neverificate complet"
              value={
                healths.filter((h) => h === "unknown" || h === "na").length
              }
              tone="unknown"
            />
          </div>
          <Card
            title="Pagini de produs"
            description="Starea fiecărei pagini, după ultima verificare"
            flush
          >
            {pages.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Pagină</th>
                      <th>Stare</th>
                      <th className="col-wide">Ce am găsit</th>
                      <th className="num">Afișare</th>
                      <th>Ultimele verificări</th>
                      <th>Verificată</th>
                      <th aria-label="Deschide" />
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((latest) => {
                      const { host, path } = splitUrl(latest.url);
                      const sum = summarize(latest);
                      const history = scans
                        .filter(
                          (s) =>
                            s.url === latest.url &&
                            s.state !== "QUEUED" &&
                            s.state !== "RUNNING",
                        )
                        .slice(0, 12)
                        .reverse();
                      return (
                        <tr
                          key={latest.url}
                          className="row-link"
                          onClick={() => navigate(`/scan/${latest.id}`)}
                        >
                          <td>
                            <span className="page-cell">
                              <strong>{host}</strong>
                              <small title={path}>{path}</small>
                            </span>
                          </td>
                          <td>
                            <StatusPill health={sum.health} />
                          </td>
                          <td className="col-wide muted-cell">
                            <span className="clip">
                              {sum.health === "ok" ? sum.title : sum.detail}
                            </span>
                          </td>
                          <td className="num mono">
                            {seconds(latest.report?.observation.usableMs)}
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
            ) : (
              <Empty
                icon={PackageSearch}
                title="Nicio pagină verificată"
                action={
                  <button
                    className="btn primary"
                    onClick={() => navigate("/new")}
                  >
                    Verifică prima pagină
                  </button>
                }
              >
                Adaugă adresa unui produs din magazin pentru a începe.
              </Empty>
            )}
          </Card>
        </>
      )}
      {tab === "history" && <HistoryTab scans={scans} navigate={navigate} />}
      {tab === "settings" && (
        <SettingsPage settings={settings} onSave={onSaveSettings} />
      )}
      {tab === "rules" && (
        <div className="grid-2-1">
          <Card title="Cele 7 verificări ale modulului" flush>
            <ul className="rule-list">
              {Object.entries(ruleCopy).map(([id, copy]) => (
                <li key={id}>
                  <span className="rule-ico">
                    <Check size={12} strokeWidth={2.6} />
                  </span>
                  <div>
                    <strong>{copy.title}</strong>
                    <p>{copy.checks}</p>
                  </div>
                  <code>{id}</code>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Cum verificăm" description="Fără instalare în magazin">
            <ul className="facts">
              <li>
                Pagina este deschisă într-un browser real, într-o sesiune nouă,
                fără conturi sau cookies salvate.
              </li>
              <li>
                Nu apăsăm butoane, nu adăugăm în coș și nu plasăm comenzi.
              </li>
              <li>
                Dacă magazinul afișează CAPTCHA sau cere autentificare,
                rezultatul este „Neverificat”, nu o eroare.
              </li>
              <li>
                „Funcționează” înseamnă că punctul a fost verificat în această
                sesiune, nu o garanție pentru tot magazinul.
              </li>
            </ul>
            <h3 className="sub-title">Nu face parte din acest modul</h3>
            <ul className="facts muted-facts">
              {[
                "Adăugarea în coș și variantele",
                "Fluxul de comandă",
                "Versiunea mobilă",
              ].map((t) => (
                <li key={t}>
                  <Minus size={12} /> {t}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
