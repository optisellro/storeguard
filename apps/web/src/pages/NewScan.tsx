import { useState, type FormEvent } from "react";
import * as Checkbox from "@radix-ui/react-checkbox";
import {
  Check,
  Globe2,
  LoaderCircle,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import type { Scan } from "../../../../packages/contracts/src/index";
import { Card, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { ruleCopy } from "../lib/report";
import { PDP_MODULE } from "../app/navigation";

export function NewScan({
  navigate,
  onCreated,
}: {
  navigate: (path: string) => void;
  onCreated: (scan: Scan) => void;
}) {
  const [url, setUrl] = useState("");
  const [expectedActive, setExpected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const scan = await api<Scan>("/scans", {
        method: "POST",
        body: JSON.stringify({ url: url.trim(), expectedActive }),
      });
      onCreated(scan);
      navigate(`/scan/${scan.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow={`Modul · ${PDP_MODULE.label}`}
        title="Verificare nouă"
        description="Deschidem pagina produsului într-un browser real și îți spunem clar ce funcționează."
      />
      <div className="grid-2-1">
        <Card title="Ce pagină verificăm?">
          <form className="form" onSubmit={submit}>
            <label className="field-label" htmlFor="product-url">
              Adresa paginii de produs
            </label>
            <div className="input-icon">
              <Globe2 size={14} />
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
              O pagină publică din magazinul tău. Adresele interne sau private
              sunt blocate.
            </p>
            <label className="check-field">
              <Checkbox.Root
                className="checkbox"
                checked={expectedActive}
                onCheckedChange={(v) => setExpected(v === true)}
              >
                <Checkbox.Indicator>
                  <Check size={11} strokeWidth={3} />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span>
                <strong>Produsul ar trebui să fie activ</strong>
                <small>
                  Dacă pagina răspunde „produs negăsit”, o raportăm ca problemă.
                  Debifează pentru produse retrase intenționat.
                </small>
              </span>
            </label>
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
                  <ScanLine size={14} />
                )}
                Pornește verificarea
              </button>
              <span className="muted-small">
                Durează de obicei sub 30 de secunde.
              </span>
            </div>
          </form>
        </Card>
        <Card title="Ce verificăm">
          <ul className="facts compact">
            {Object.values(ruleCopy).map((r) => (
              <li key={r.title}>
                <Check size={12} strokeWidth={2.6} /> {r.title}
              </li>
            ))}
          </ul>
          <p className="note">
            <ShieldCheck size={13} />
            Nu apăsăm butoane și nu plasăm comenzi. Sesiunea este izolată, fără
            conturi ale magazinului.
          </p>
        </Card>
      </div>
    </>
  );
}
