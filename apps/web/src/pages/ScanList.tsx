import { ChevronRight, ScanLine } from "lucide-react";
import type { Scan } from "../../../../packages/contracts/src/index";
import { Empty, StatusPill } from "../components/ui";
import { issuesOf, scanHealth, summarize } from "../lib/report";
import { dateTime, relative, seconds, splitUrl } from "../lib/format";

export function ScanList({
  scans,
  navigate,
  base,
  emptyText = "Verificările tale vor apărea aici.",
}: {
  scans: Scan[];
  navigate: (path: string) => void;
  /** Store route prefix, e.g. /s/<id>. */
  base: string;
  emptyText?: string;
}) {
  if (!scans.length)
    return (
      <Empty
        icon={ScanLine}
        title="Nicio verificare încă"
        action={
          <button className="btn" onClick={() => navigate(`${base}/pages`)}>
            Verifică o pagină
          </button>
        }
      >
        {emptyText}
      </Empty>
    );
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Pagină</th>
            <th>Rezultat</th>
            <th className="col-wide">Ce am găsit</th>
            <th className="num">Conținut principal</th>
            <th>Verificată</th>
            <th aria-label="Deschide" />
          </tr>
        </thead>
        <tbody>
          {scans.map((scan) => {
            const health = scanHealth(scan);
            const { host, path } = splitUrl(scan.url);
            const detail =
              health === "running"
                ? scan.state === "QUEUED"
                  ? "În așteptare…"
                  : "Verificare în curs…"
                : (issuesOf(scan)[0]?.summary ?? summarize(scan).title);
            return (
              <tr
                key={scan.id}
                className="row-link"
                onClick={() => navigate(`${base}/scan/${scan.id}`)}
              >
                <td>
                  <span className="page-cell">
                    <strong>{host}</strong>
                    <small title={path}>{path}</small>
                  </span>
                </td>
                <td>
                  <StatusPill health={health} />
                </td>
                <td className="col-wide muted-cell">
                  <span className="clip">{detail}</span>
                </td>
                <td className="num mono">
                  {seconds(scan.report?.diagnostics?.metrics.lcp.value)}
                </td>
                <td
                  title={dateTime(scan.createdAt)}
                  className="muted-cell nowrap"
                >
                  {relative(scan.createdAt)}
                </td>
                <td className="go">
                  <button
                    className="icon-btn"
                    aria-label="Deschide raportul"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`${base}/scan/${scan.id}`);
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
