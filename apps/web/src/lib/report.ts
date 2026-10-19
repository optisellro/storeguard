import type {
  FeatureStatus,
  Finding,
  Observation,
  RuleResult,
  Scan,
  Settings,
  Verdict,
} from "../../../../packages/contracts/src/index";
import { plural, seconds } from "./format";

/** Client-facing status. Technical verdicts stay available in developer details. */
export type Health =
  | "ok"
  | "warn"
  | "fail"
  | "unknown"
  | "na"
  | "off"
  | "running";

export const healthOf = (verdict: Verdict): Health =>
  verdict === "PASS"
    ? "ok"
    : verdict === "WARNING"
      ? "warn"
      : verdict === "FAIL"
        ? "fail"
        : verdict === "NOT_APPLICABLE"
          ? "na"
          : "unknown";

export const healthLabel: Record<Health, string> = {
  ok: "Fără probleme detectate",
  warn: "Avertizare",
  fail: "Problemă confirmată",
  unknown: "Verificare inconcludentă",
  na: "Neverificat",
  off: "Indisponibil",
  running: "În verificare",
};
/** Short labels for compact places (pills in tables, chart legends). */
export const shortLabel: Record<Health, string> = {
  ok: "Fără probleme",
  warn: "Avertizare",
  fail: "Problemă",
  unknown: "Inconcludent",
  na: "Neverificat",
  off: "Indisponibil",
  running: "În verificare",
};
export const featureHealth = (s: FeatureStatus): Health =>
  s === "fail"
    ? "fail"
    : s === "warn"
      ? "warn"
      : s === "ok"
        ? "ok"
        : s === "unknown"
          ? "unknown"
          : s === "not_run"
            ? "na"
            : "off";

/** Health of a whole scan: availability rules and technical diagnostics together. */
export function scanHealth(scan: Scan): Health {
  if (scan.state === "QUEUED" || scan.state === "RUNNING") return "running";
  if (!scan.report) return "unknown";
  const issues = issuesOf(scan);
  if (issues.some((i) => i.severity === "problem")) return "fail";
  if (issues.some((i) => i.severity === "warning")) return "warn";
  const base = healthOf(scan.report.verdict);
  return base === "na" ? "unknown" : base;
}

/** Feature group of each availability rule, for the unified issue list. */
const ruleFeature: Record<string, string> = {
  "OS-PDP-001": "01",
  "OS-PDP-002": "01",
  "OS-PDP-006": "01",
  "OS-PDP-009": "01",
  "OS-PDP-003": "02",
  "OS-PDP-004": "02",
  "OS-PDP-010": "03",
};

/** Every issue of a scan, availability rules and diagnostics, worst first. */
export function issuesOf(scan: Scan): Finding[] {
  const r = scan.report;
  if (!r) return [];
  const fromRules: Finding[] = r.rules
    .map((rule) => ({
      rule,
      info: explainRule(rule, r.observation, scan.settings),
    }))
    .filter(({ info }) => info.health === "fail" || info.health === "warn")
    .map(
      ({ rule, info }): Finding => ({
        key: `rule:${rule.id}`,
        feature: ruleFeature[rule.id] ?? "01",
        severity: info.health === "fail" ? "problem" : "warning",
        title: info.title,
        summary: info.summary,
        action: info.action ?? "",
        where: null,
        atMs: null,
        count: 1,
        thirdParty: false,
        source: null,
        technical: {
          rule: rule.id,
          explanation: rule.explanation,
          ...rule.technical,
        },
      }),
    );
  return [...fromRules, ...(r.diagnostics?.findings ?? [])].sort((a, b) =>
    a.severity === b.severity
      ? b.count - a.count
      : a.severity === "problem"
        ? -1
        : 1,
  );
}

export const ruleOrder: Health[] = ["fail", "warn", "unknown", "ok", "na"];

interface RuleCopy {
  title: string;
  checks: string;
}

export const ruleCopy: Record<string, RuleCopy> = {
  "OS-PDP-001": {
    title: "Pagina se deschide",
    checks:
      "Serverul magazinului răspunde, fără erori de server, DNS, conexiune sau certificat HTTPS.",
  },
  "OS-PDP-002": {
    title: "Produsul este disponibil",
    checks:
      "Pagina nu răspunde cu „produs negăsit” (404 / 410) pentru un produs care ar trebui să fie activ.",
  },
  "OS-PDP-003": {
    title: "Conținutul este afișat",
    checks:
      "Pagina nu rămâne albă: clienții văd text, imagini și elementele produsului.",
  },
  "OS-PDP-004": {
    title: "Încărcarea se finalizează",
    checks:
      "Pagina nu rămâne blocată într-un ecran sau indicator de încărcare care acoperă produsul.",
  },
  "OS-PDP-006": {
    title: "Redirecționări corecte",
    checks:
      "Adresa duce la produs fără bucle de redirecționare, fără pagini de eroare și spre destinația așteptată.",
  },
  "OS-PDP-009": {
    title: "Fără mesaje de eroare",
    checks:
      "Pagina nu afișează un mesaj de eroare în locul produsului, chiar dacă serverul raportează succes.",
  },
  "OS-PDP-010": {
    title: "Viteza de afișare",
    checks:
      "Măsoară după cât timp produsul devine vizibil și stabil pentru client, față de pragul tău.",
  },
};

const navigationCause = (cause: string | null | undefined) => {
  if (!cause) return "Pagina nu a putut fi deschisă.";
  if (/ENOTFOUND|EAI_AGAIN|NAME_NOT_RESOLVED|DNS/.test(cause))
    return "Domeniul magazinului nu a fost găsit (problemă de DNS).";
  if (/ECONNREFUSED|CONNECTION_REFUSED/.test(cause))
    return "Serverul magazinului a refuzat conexiunea.";
  if (
    /ECONNRESET|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE/.test(cause)
  )
    return "Conexiunea cu serverul s-a întrerupt.";
  if (/CERT|SSL/.test(cause))
    return "Certificatul de securitate HTTPS al magazinului nu este valid.";
  if (/TIMEOUT|TIMED_OUT/.test(cause))
    return "Pagina nu a răspuns în timpul maxim permis.";
  return "Pagina nu a putut fi deschisă.";
};

/** Why a scan could not be evaluated, in plain words. Null when nothing blocked it. */
export function barrierReason(o: Observation): string | null {
  if (o.securityBlocked)
    return "Adresa nu poate fi verificată: duce către o rețea privată sau o destinație blocată din motive de securitate.";
  const blocked = o.samples.at(-1)?.blocked;
  if (blocked?.startsWith("CAPTCHA"))
    return "Magazinul a afișat o verificare anti-bot (CAPTCHA), așa că pagina nu a putut fi văzută ca de un client.";
  if (blocked?.startsWith("Autentificare"))
    return "Pagina cere autentificare. Verificăm doar pagini publice.";
  if (blocked) return "Accesul la pagină a fost restricționat de magazin.";
  const env = o.environmentError;
  if (env?.startsWith("Acces restricționat"))
    return `Magazinul a refuzat accesul (cod ${o.httpStatus ?? "necunoscut"}). De obicei este o protecție a serverului, nu o problemă a produsului.`;
  if (env?.startsWith("Timeout global"))
    return "Verificarea a depășit timpul maxim permis și a fost oprită.";
  if (env?.startsWith("Chromium"))
    return "Browserul de verificare nu a putut porni pe acest calculator.";
  if (env) return env;
  if (o.analysisError && !o.samples.length)
    return "Pagina s-a deschis, dar conținutul ei nu a putut fi analizat.";
  return null;
}

export interface Explained {
  id: string;
  title: string;
  health: Health;
  summary: string;
  action?: string;
}

export function explainRule(
  rule: RuleResult,
  o: Observation,
  settings: Settings,
): Explained {
  const title = ruleCopy[rule.id]?.title ?? rule.name;
  const health = healthOf(rule.status);
  const base = { id: rule.id, title, health };
  if (health === "na")
    return {
      ...base,
      summary: "Nu se aplică, deoarece pagina nu s-a deschis normal.",
    };
  if (health === "unknown") {
    const reason = barrierReason(o);
    const last = o.samples.at(-1);
    const failedResponse =
      !!o.navigationError ||
      (o.httpStatus !== null && (o.httpStatus < 200 || o.httpStatus >= 300));
    if (
      !reason &&
      failedResponse &&
      ["OS-PDP-003", "OS-PDP-004", "OS-PDP-009", "OS-PDP-010"].includes(rule.id)
    )
      return {
        ...base,
        health: "na",
        summary: "Nu se aplică, deoarece pagina nu s-a deschis normal.",
      };
    const summary = reason
      ? "Nu a putut fi verificat, din motivul de mai sus."
      : rule.id === "OS-PDP-010"
        ? "Nu am putut măsura momentul în care produsul devine vizibil."
        : o.selectorError
          ? "Un selector din setări nu este valid, așa că acest punct nu a fost verificat."
          : last && !last.productSignal
            ? "Nu am recunoscut automat elementele produsului (titlu, preț sau imagine)."
            : o.httpStatus === null
              ? "Nu am primit un răspuns de la pagină."
              : "Acest punct nu a putut fi verificat sigur în această sesiune.";
    return { ...base, summary };
  }
  switch (rule.id) {
    case "OS-PDP-001":
      return health === "ok"
        ? { ...base, summary: "Serverul magazinului a răspuns normal." }
        : {
            ...base,
            summary:
              o.httpStatus && o.httpStatus >= 500
                ? `Serverul magazinului a răspuns cu o eroare (${o.httpStatus}). Clienții nu pot vedea produsul.`
                : `${navigationCause(o.navigationError)} Clienții nu pot vedea produsul.`,
            action:
              "Verifică hostingul și serverul magazinului sau contactează echipa tehnică.",
          };
    case "OS-PDP-002":
      return health === "ok"
        ? { ...base, summary: "Pagina produsului există." }
        : {
            ...base,
            summary:
              health === "fail"
                ? `Produsul nu mai există (eroare ${o.httpStatus}), deși ar trebui să fie activ.`
                : `Pagina răspunde cu „produs negăsit” (${o.httpStatus}). Dacă produsul a fost retras intenționat, poți ignora.`,
            action:
              "Verifică dacă produsul a fost șters sau și-a schimbat adresa. Dacă există un produs nou, adaugă un redirect către el.",
          };
    case "OS-PDP-003":
      return health === "ok"
        ? { ...base, summary: "Clienții văd conținutul paginii." }
        : {
            ...base,
            summary: "Pagina se deschide, dar rămâne goală pentru clienți.",
            action:
              "De obicei este o eroare de JavaScript sau de temă. Verifică ultimele modificări din magazin.",
          };
    case "OS-PDP-004":
      return health === "ok"
        ? { ...base, summary: "Pagina ajunge la o stare stabilă." }
        : {
            ...base,
            summary:
              "Pagina rămâne blocată în încărcare și produsul nu poate fi folosit.",
            action:
              "Verifică scripturile care încarcă produsul (stoc, preț, variante) și aplicațiile instalate recent.",
          };
    case "OS-PDP-006": {
      if (health === "ok")
        return { ...base, summary: "Adresa duce corect la produs." };
      const loop = o.redirectError?.includes("Buclă");
      const limit = o.redirectError?.includes("maxim");
      const toError =
        !o.redirectError &&
        o.redirects.length > 1 &&
        ((o.httpStatus ?? 0) >= 400 || o.samples.at(-1)?.softError);
      return {
        ...base,
        summary: loop
          ? "Adresa intră într-o buclă de redirecționări și pagina nu se mai deschide."
          : limit
            ? `Adresa trece prin prea multe redirecționări (peste ${settings.maxRedirects}).`
            : toError
              ? "Redirecționarea duce către o pagină de eroare."
              : "Adresa duce către o altă pagină decât cea așteptată.",
        action:
          "Verifică regulile de redirect din platforma magazinului și destinația setată.",
      };
    }
    case "OS-PDP-009":
      return health === "ok"
        ? { ...base, summary: "Nu apare niciun mesaj de eroare." }
        : {
            ...base,
            summary:
              "Pagina afișează un mesaj de eroare în locul produsului, deși serverul raportează succes.",
            action:
              "Verifică dacă produsul are date lipsă sau dacă un modul al magazinului a eșuat.",
          };
    case "OS-PDP-010":
      return health === "ok"
        ? {
            ...base,
            summary: `Produsul devine vizibil în ${seconds(o.usableMs)}.`,
          }
        : {
            ...base,
            summary: `Produsul devine vizibil abia după ${seconds(o.usableMs)}, peste pragul de ${seconds(settings.slowThresholdMs)}. Unii clienți pot pleca înainte.`,
            action:
              "Optimizează imaginile produsului și redu scripturile externe care se încarcă înaintea paginii.",
          };
    default:
      return { ...base, summary: rule.explanation };
  }
}

export interface Summary {
  health: Health;
  title: string;
  detail: string;
}

export function summarize(scan: Scan): Summary {
  const report = scan.report;
  if (!report)
    return {
      health: "unknown",
      title: "Verificarea nu a fost finalizată",
      detail: scan.error ?? "Scanarea a fost întreruptă înainte de rezultat.",
    };
  const o = report.observation;
  const items = report.rules.map((r) => explainRule(r, o, scan.settings));
  const fails = items.filter((i) => i.health === "fail");
  const warns = items.filter((i) => i.health === "warn");
  const unknown = items.filter((i) => i.health === "unknown");
  if (fails.length)
    return {
      health: "fail",
      title:
        fails.length === 1
          ? "Am găsit o problemă pe această pagină"
          : `Am găsit ${plural(fails.length, "problemă", "probleme")} pe această pagină`,
      detail: fails[0].summary,
    };
  const barrier = barrierReason(o);
  if (barrier && unknown.length >= items.length - 1)
    return {
      health: "unknown",
      title: "Nu am putut verifica pagina",
      detail: barrier,
    };
  if (warns.length)
    return {
      health: "warn",
      title: "Pagina funcționează, dar necesită atenție",
      detail: warns[0].summary,
    };
  if (unknown.length)
    return {
      health: "unknown",
      title:
        unknown.length === items.length
          ? "Nu am putut verifica pagina"
          : "Pagina funcționează, cu verificări incomplete",
      detail:
        unknown.length === items.length
          ? (barrier ?? unknown[0]?.summary ?? "")
          : `${plural(unknown.length, "verificare nu a putut fi confirmată", "verificări nu au putut fi confirmate")}. ${barrier ?? unknown[0].summary}`,
    };
  return {
    health: "ok",
    title: "Pagina de produs funcționează corect",
    detail: `Toate cele ${items.length} verificări au trecut. Produsul a devenit vizibil în ${seconds(o.usableMs)}.`,
  };
}
