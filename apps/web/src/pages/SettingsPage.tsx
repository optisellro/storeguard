import { useEffect, useState, type FormEvent } from "react";
import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import {
  defaults,
  type Settings,
} from "../../../../packages/contracts/src/index";
import { Card, PageHeader } from "../components/ui";
import { api } from "../lib/api";

type NumKey =
  | "navigationTimeoutMs"
  | "renderTimeoutMs"
  | "slowThresholdMs"
  | "globalTimeoutMs"
  | "maxRedirects";
type TextKey =
  | "loaderSelector"
  | "errorSelector"
  | "expectedDomain"
  | "expectedUrl";

const numberFields: {
  key: NumKey;
  label: string;
  help: string;
  unit: string;
  min: number;
  max: number;
}[] = [
  {
    key: "slowThresholdMs",
    label: "Prag de încărcare lentă",
    help: "Peste această valoare, viteza paginii primește „Atenție”.",
    unit: "ms",
    min: 100,
    max: 30000,
  },
  {
    key: "navigationTimeoutMs",
    label: "Timp maxim de răspuns al paginii",
    help: "Cât așteptăm ca serverul să trimită pagina.",
    unit: "ms",
    min: 200,
    max: 30000,
  },
  {
    key: "renderTimeoutMs",
    label: "Timp maxim de afișare a produsului",
    help: "Cât urmărim pagina după ce s-a deschis.",
    unit: "ms",
    min: 400,
    max: 30000,
  },
  {
    key: "globalTimeoutMs",
    label: "Durată maximă a unei verificări",
    help: "Limita totală, cel puțin cât fiecare timp de mai sus.",
    unit: "ms",
    min: 1000,
    max: 60000,
  },
  {
    key: "maxRedirects",
    label: "Număr maxim de redirecționări",
    help: "Peste acest număr, adresa este considerată greșită.",
    unit: "",
    min: 1,
    max: 20,
  },
];

const textFields: {
  key: TextKey;
  label: string;
  help: string;
  placeholder: string;
}[] = [
  {
    key: "loaderSelector",
    label: "Selector CSS pentru indicatorul de încărcare",
    help: "Ajută la detectarea paginilor blocate în încărcare.",
    placeholder: ".product-loader",
  },
  {
    key: "errorSelector",
    label: "Selector CSS pentru mesajul de eroare",
    help: "Elementul pe care tema ta îl afișează când produsul nu se poate încărca.",
    placeholder: ".product-error",
  },
  {
    key: "expectedDomain",
    label: "Domeniu așteptat",
    help: "Opțional. Dacă pagina ajunge pe alt domeniu, este raportată.",
    placeholder: "magazin.ro",
  },
  {
    key: "expectedUrl",
    label: "Destinație finală așteptată",
    help: "Opțional. Se aplică tuturor verificărilor, deci folosește-l doar pentru o singură pagină.",
    placeholder: "https://magazin.ro/produs/exemplu",
  },
];

export function SettingsPage({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Setări"
        description="Pragurile și semnalele folosite de verificări. Se aplică verificărilor viitoare."
      />
      <form className="settings" onSubmit={submit}>
        <Card
          title="Timpi și limite"
          description="Valori de referință pentru magazinul tău, nu standarde universale."
        >
          <div className="field-grid">
            {numberFields.map((f) => (
              <div className="field" key={f.key}>
                <label className="field-label" htmlFor={f.key}>
                  {f.label}
                </label>
                <div className="input-unit">
                  <input
                    id={f.key}
                    type="number"
                    required
                    min={f.min}
                    max={f.max}
                    value={draft[f.key]}
                    onChange={(e) => change(f.key, Number(e.target.value))}
                  />
                  {f.unit && <span>{f.unit}</span>}
                </div>
                <p className="field-help">{f.help}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card
          title="Semnale specifice magazinului"
          description="Opționale. Ajută la detecții mai precise pentru tema magazinului tău."
        >
          <div className="field-grid two">
            {textFields.map((f) => (
              <div className="field" key={f.key}>
                <label className="field-label" htmlFor={f.key}>
                  {f.label}
                </label>
                <input
                  id={f.key}
                  placeholder={f.placeholder}
                  value={draft[f.key]}
                  onChange={(e) => change(f.key, e.target.value)}
                />
                <p className="field-help">{f.help}</p>
              </div>
            ))}
            <div className="field span-2">
              <label className="field-label" htmlFor="errorMessages">
                Mesaje de eroare specifice (câte unul pe rând)
              </label>
              <textarea
                id="errorMessages"
                rows={3}
                value={draft.errorMessages.join("\n")}
                onChange={(e) =>
                  change("errorMessages", e.target.value.split("\n"))
                }
              />
              <p className="field-help">
                Textele afișate de magazin când un produs nu se poate încărca,
                de exemplu „Produsul nu este disponibil momentan”.
              </p>
            </div>
          </div>
        </Card>
        <div className="settings-bar">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="save-ok">
              <Check size={13} /> Setările au fost salvate.
            </p>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDraft(defaults);
              setSaved(false);
            }}
          >
            <RotateCcw size={13} /> Valori implicite
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy && <LoaderCircle size={13} className="spin" />}
            Salvează setările
          </button>
        </div>
      </form>
    </>
  );
}
