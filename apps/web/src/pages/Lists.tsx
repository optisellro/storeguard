import { useState } from "react";
import { ChevronRight, ShieldCheck, Sparkles } from "lucide-react";
import type { Scan } from "../../../../packages/contracts/src/index";
import { Card, Empty, PageHeader, StatusIcon } from "../components/ui";
import { ScanList } from "./ScanList";
import { latestPerPage } from "../lib/stats";
import {
  explainRule,
  healthLabel,
  scanHealth,
  type Health,
} from "../lib/report";
import { relative, splitUrl } from "../lib/format";
import { allItems, PDP_MODULE } from "../app/navigation";

export function Issues({
  scans,
  navigate,
}: {
  scans: Scan[];
  navigate: (p: string) => void;
}) {
  const rows = latestPerPage(scans).flatMap((scan) =>
    (scan.report?.rules ?? [])
      .map((rule) => ({
        scan,
        info: explainRule(rule, scan.report!.observation, scan.settings),
      }))
      .filter(({ info }) => info.health === "fail" || info.health === "warn"),
  );
  rows.sort((a, b) =>
    a.info.health === b.info.health ? 0 : a.info.health === "fail" ? -1 : 1,
  );
  return (
    <>
      <PageHeader
        title="Probleme"
        description="Tot ce trebuie rezolvat, pe baza ultimei verificări a fiecărei pagini."
      />
      <Card flush>
        {rows.length ? (
          <ul className="issue-list big">
            {rows.map(({ scan, info }) => {
              const { host, path } = splitUrl(scan.url);
              return (
                <li key={scan.id + info.id}>
                  <button onClick={() => navigate(`/scan/${scan.id}`)}>
                    <StatusIcon health={info.health} />
                    <span className="issue-text">
                      <strong>
                        {info.title} <em>· {healthLabel[info.health]}</em>
                      </strong>
                      <span>{info.summary}</span>
                      <small>
                        {host}
                        {path} · {PDP_MODULE.label} · {relative(scan.createdAt)}
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
            Când o verificare găsește o eroare, o vei vedea aici, cu explicația
            și pașii de rezolvare.
          </Empty>
        )}
      </Card>
    </>
  );
}

const filters: { id: "all" | Health; label: string }[] = [
  { id: "all", label: "Toate" },
  { id: "fail", label: "Probleme" },
  { id: "warn", label: "Atenție" },
  { id: "unknown", label: "Neverificate" },
  { id: "ok", label: "Funcționează" },
];

export function History({
  scans,
  navigate,
}: {
  scans: Scan[];
  navigate: (p: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | Health>("all");
  const shown =
    filter === "all" ? scans : scans.filter((s) => scanHealth(s) === filter);
  return (
    <>
      <PageHeader
        title="Istoric verificări"
        description="Toate verificările efectuate, din toate modulele."
      />
      <div
        className="segmented"
        role="group"
        aria-label="Filtrează după rezultat"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            className={filter === f.id ? "on" : ""}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span>
              {f.id === "all"
                ? scans.length
                : scans.filter((s) => scanHealth(s) === f.id).length}
            </span>
          </button>
        ))}
      </div>
      <Card flush>
        <ScanList
          scans={shown}
          navigate={navigate}
          emptyText="Nicio verificare pentru acest filtru."
        />
      </Card>
    </>
  );
}

export function ComingSoon({
  id,
  navigate,
}: {
  id: string;
  navigate: (p: string) => void;
}) {
  const item = allItems.find((i) => i.id === id);
  if (!item)
    return (
      <Empty
        icon={Sparkles}
        title="Pagina nu există"
        action={
          <button className="btn" onClick={() => navigate("/")}>
            Înapoi la prezentare
          </button>
        }
      />
    );
  const Icon = item.icon;
  return (
    <>
      <PageHeader
        eyebrow={`Modul · ${item.group}`}
        title={item.label}
        description={item.description}
      />
      <Card>
        <div className="soon">
          <span className="soon-icon">
            <Icon size={18} />
          </span>
          <h2>Modul în dezvoltare</h2>
          <p>
            Acest modul nu este încă disponibil, așa că nu afișăm niciun
            rezultat pentru el. Până atunci, poți verifica paginile de produs.
          </p>
          <button
            className="btn primary"
            onClick={() => navigate(PDP_MODULE.path)}
          >
            Mergi la {PDP_MODULE.label}
          </button>
        </div>
      </Card>
    </>
  );
}
