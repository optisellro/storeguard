import { useState } from "react";
import type { Scan } from "../../../../packages/contracts/src/index";
import { Card } from "../components/ui";
import { ScanList } from "./ScanList";
import { scanHealth, type Health } from "../lib/report";

const filters: { id: "all" | Health; label: string }[] = [
  { id: "all", label: "Toate" },
  { id: "fail", label: "Probleme" },
  { id: "warn", label: "Avertizări" },
  { id: "unknown", label: "Inconcludente" },
  { id: "ok", label: "Fără probleme" },
];

export function HistoryTab({
  scans,
  navigate,
  base,
}: {
  scans: Scan[];
  navigate: (p: string) => void;
  base: string;
}) {
  const [filter, setFilter] = useState<"all" | Health>("all");
  const shown =
    filter === "all" ? scans : scans.filter((s) => scanHealth(s) === filter);
  return (
    <>
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
          base={base}
          emptyText="Nicio verificare pentru acest filtru."
        />
      </Card>
    </>
  );
}
