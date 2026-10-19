import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import {
  scanPhases,
  type Scan,
  type ScanPhase,
} from "../../../../packages/contracts/src/index";
import { splitUrl } from "../lib/format";

const steps: Record<ScanPhase, { title: string; detail: string }> = {
  PREPARING: {
    title: "Pregătim un browser izolat",
    detail: "Verificăm adresa și pornim o sesiune nouă, fără date salvate.",
  },
  NAVIGATING: {
    title: "Deschidem pagina produsului",
    detail: "Urmărim răspunsul serverului și eventualele redirecționări.",
  },
  OBSERVING: {
    title: "Analizăm ce vede clientul",
    detail:
      "Conținut, imagini, preț, indicatori de încărcare și mesaje de eroare.",
  },
  EVALUATING: {
    title: "Verificăm cele 7 reguli",
    detail: "Fiecare rezultat primește o explicație.",
  },
  EVIDENCE: {
    title: "Salvăm dovezile",
    detail: "Captură de ecran a paginii, dacă există o problemă de arătat.",
  },
};

function useElapsed(since: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, (now - Date.parse(since)) / 1000);
}

export function ScanProgress({ scan, ahead }: { scan: Scan; ahead: number }) {
  const elapsed = useElapsed(scan.createdAt);
  const queued = scan.state === "QUEUED";
  const current = queued ? -1 : scanPhases.indexOf(scan.phase ?? "PREPARING");
  const { host, path } = splitUrl(scan.url);
  const progress = queued ? 4 : ((current + 0.5) / scanPhases.length) * 100;
  return (
    <div className="scan-live" aria-live="polite">
      <div
        className="browser"
        data-phase={queued ? "QUEUED" : (scan.phase ?? "PREPARING")}
      >
        <div className="browser-bar">
          <span className="browser-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="browser-url">
            <Lock size={11} />
            <span>{host}</span>
            <span className="browser-path">{path}</span>
          </span>
        </div>
        <div className="browser-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        {scan.preview ? (
          <div className="browser-page has-shot">
            <img
              className="browser-shot"
              src={`/api/scans/${scan.id}/preview`}
              alt="Pagina produsului, așa cum a fost încărcată de scanner"
            />
            <span className="scan-beam" />
          </div>
        ) : (
          <div className="browser-page">
            <div className="sk-nav">
              <span className="sk sk-logo" />
              <span className="sk sk-link" />
              <span className="sk sk-link" />
              <span className="sk sk-link" />
            </div>
            <div className="sk-product">
              <div className="sk sk-image" />
              <div className="sk-info">
                <span className="sk sk-title" />
                <span className="sk sk-title short" />
                <span className="sk sk-price" />
                <span className="sk sk-line" />
                <span className="sk sk-line" />
                <span className="sk sk-line short" />
                <span className="sk sk-button" />
              </div>
            </div>
            <span className="scan-beam" />
            <span className="scan-focus focus-a" />
            <span className="scan-focus focus-b" />
          </div>
        )}
      </div>
      <div className="scan-steps">
        <p className="eyebrow">Verificare în curs · {elapsed.toFixed(0)} s</p>
        <h2>{queued ? "În așteptare" : "Verificăm pagina"}</h2>
        <p className="scan-steps-desc">
          {queued
            ? ahead > 0
              ? `Pornește după ${ahead === 1 ? "verificarea" : `cele ${ahead} verificări`} din fața ei.`
              : "Pornește imediat ce se eliberează un loc."
            : "Pagina este deschisă într-un browser real, exact cum o vede un client."}
        </p>
        <ol>
          {scanPhases.map((phase, i) => {
            const state =
              i < current ? "done" : i === current ? "active" : "pending";
            return (
              <li key={phase} className={`step ${state}`}>
                <span className="step-mark">
                  {state === "done" ? (
                    <Check size={12} strokeWidth={3} />
                  ) : (
                    <span />
                  )}
                </span>
                <div>
                  <strong>{steps[phase].title}</strong>
                  {state === "active" && <span>{steps[phase].detail}</span>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="scan-steps-note">
          Durează de obicei sub 30 de secunde. Rezultatul apare automat aici.
        </p>
      </div>
    </div>
  );
}
