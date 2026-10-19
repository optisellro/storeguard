import { useState, type FormEvent } from "react";
import {
  ChevronRight,
  LoaderCircle,
  Plus,
  Store as StoreIcon,
  Trash2,
} from "lucide-react";
import type { Store } from "../../../../packages/contracts/src/index";
import { Card, Empty, PageHeader, StatusPill } from "../components/ui";
import { api } from "../lib/api";
import { plural, relative } from "../lib/format";

export interface StoreWithSummary extends Store {
  summary: {
    pages: number;
    scans: number;
    running: number;
    lastScanAt: string | null;
    failing: number;
    warning: number;
  };
}

export function Stores({
  stores,
  navigate,
  onChanged,
}: {
  stores: StoreWithSummary[];
  navigate: (path: string) => void;
  onChanged: () => Promise<unknown>;
}) {
  const [error, setError] = useState("");
  const remove = async (store: StoreWithSummary) => {
    if (
      !confirm(
        `Ștergi magazinul ${store.name} și toate verificările lui? Acțiunea nu poate fi anulată.`,
      )
    )
      return;
    setError("");
    try {
      await fetch(`/api/stores/${store.id}`, { method: "DELETE" }).then(
        async (r) => {
          if (!r.ok)
            throw new Error(
              (await r.json().catch(() => ({}))).error ??
                "Magazinul nu a putut fi șters.",
            );
        },
      );
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageHeader
        title="Magazine"
        description="Fiecare magazin este un mediu separat: paginile, verificările și problemele lui nu se amestecă cu ale altor magazine."
      />
      <div className="grid-2-1">
        <Card title="Magazinele tale" flush>
          {stores.length ? (
            <ul className="store-list">
              {stores.map((s) => {
                const health = s.summary.failing
                  ? "fail"
                  : s.summary.warning
                    ? "warn"
                    : s.summary.pages
                      ? "ok"
                      : "na";
                return (
                  <li key={s.id}>
                    <button
                      className="store-open"
                      onClick={() => navigate(`/s/${s.id}`)}
                    >
                      <span className="store-avatar lg">
                        {s.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="store-text">
                        <strong>{s.name}</strong>
                        <small>
                          {s.domain} ·{" "}
                          {plural(s.summary.pages, "pagină", "pagini")}
                          {s.summary.lastScanAt
                            ? ` · ultima verificare ${relative(s.summary.lastScanAt)}`
                            : ""}
                        </small>
                      </span>
                      <StatusPill
                        health={health}
                        label={
                          s.summary.failing
                            ? `${plural(s.summary.failing, "pagină cu probleme", "pagini cu probleme")}`
                            : s.summary.warning
                              ? `${plural(s.summary.warning, "pagină cu avertizări", "pagini cu avertizări")}`
                              : s.summary.pages
                                ? "Fără probleme"
                                : "Neverificat"
                        }
                      />
                      <ChevronRight size={14} className="chev" />
                    </button>
                    <button
                      className="icon-btn danger"
                      aria-label={`Șterge ${s.name}`}
                      onClick={() => remove(s)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={StoreIcon} title="Niciun magazin încă">
              Adaugă primul magazin pentru a începe verificările.
            </Empty>
          )}
          {error && <p className="form-error card-pad">{error}</p>}
        </Card>
        <Card title="Adaugă un magazin">
          <CreateStore
            onCreated={async (id) => {
              await onChanged();
              navigate(`/s/${id}`);
            }}
          />
        </Card>
      </div>
    </>
  );
}

export function CreateStore({
  onCreated,
}: {
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const store = await api<Store>("/stores", {
        method: "POST",
        body: JSON.stringify({ name, domain }),
      });
      setName("");
      setDomain("");
      onCreated(store.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="form" onSubmit={submit}>
      <label className="field-label" htmlFor="store-name">
        Numele magazinului
      </label>
      <input
        id="store-name"
        required
        minLength={2}
        maxLength={80}
        placeholder="Magazinul meu"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="field-label spaced" htmlFor="store-domain">
        Domeniu
      </label>
      <input
        id="store-domain"
        required
        placeholder="magazin.ro"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
      />
      <p className="field-help">
        Doar paginile de pe acest domeniu (și subdomeniile lui) pot fi
        verificate în acest magazin.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Plus size={14} />
          )}
          Creează magazinul
        </button>
      </div>
    </form>
  );
}
