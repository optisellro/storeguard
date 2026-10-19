import type {
  Observation,
  Settings,
  RuleResult,
  Verdict,
} from "../../contracts/src/index.js";
export const ruleNames = {
  "OS-PDP-001": "Pagină indisponibilă",
  "OS-PDP-002": "Produs negăsit",
  "OS-PDP-003": "Pagină goală",
  "OS-PDP-004": "Încărcare persistentă",
  "OS-PDP-006": "Redirect invalid",
  "OS-PDP-009": "Pagină de eroare cu HTTP 200",
  "OS-PDP-010": "Încărcare lentă",
};
export function evaluate(
  o: Observation,
  s: Settings,
  expectedActive: boolean,
): RuleResult[] {
  const last = o.samples.at(-1),
    successful =
      o.httpStatus !== null && o.httpStatus >= 200 && o.httpStatus < 300;
  const barrier =
    o.environmentError ||
    (o.securityBlocked ? "Acces blocat de politica scannerului." : null) ||
    last?.blocked;
  const technical = {
    httpStatus: o.httpStatus,
    navigationError: o.navigationError,
  };
  const result = (
    id: keyof typeof ruleNames,
    status: Verdict,
    explanation: string,
    evidence: Record<string, unknown> = {},
  ): RuleResult => ({
    id,
    name: ruleNames[id],
    status,
    explanation,
    technical: evidence,
  });
  const results: RuleResult[] = [];
  if (barrier)
    results.push(
      result("OS-PDP-001", "INCONCLUSIVE", String(barrier), technical),
    );
  else if (o.httpStatus && o.httpStatus >= 500)
    results.push(
      result(
        "OS-PDP-001",
        "FAIL",
        `Serverul a răspuns cu HTTP ${o.httpStatus}.`,
        technical,
      ),
    );
  else if (o.navigationError && !o.redirectError)
    results.push(
      result(
        "OS-PDP-001",
        "FAIL",
        `Navigarea a eșuat: ${o.navigationError}.`,
        technical,
      ),
    );
  else
    results.push(
      result(
        "OS-PDP-001",
        o.httpStatus === null ? "INCONCLUSIVE" : "PASS",
        o.httpStatus === null
          ? "Nu a fost primit un răspuns principal."
          : "Pagina a răspuns; verdictul de randare este evaluat separat.",
        technical,
      ),
    );
  const missing = [404, 410].includes(o.httpStatus ?? 0);
  results.push(
    result(
      "OS-PDP-002",
      barrier
        ? "INCONCLUSIVE"
        : missing
          ? expectedActive
            ? "FAIL"
            : "WARNING"
          : o.httpStatus === null
            ? "INCONCLUSIVE"
            : "PASS",
      missing
        ? `HTTP ${o.httpStatus}. ${expectedActive ? "Produsul a fost declarat activ." : "Starea așteptată a produsului nu este cunoscută."}`
        : barrier
          ? "Accesul nu permite verificarea produsului."
          : "Nu a fost observat HTTP 404/410.",
      { expectedActive, httpStatus: o.httpStatus },
    ),
  );
  const inconclusive =
    !!barrier ||
    !!o.navigationError ||
    !last ||
    !!o.selectorError ||
    (o.blockedRequests > 0 && !last?.productSignal);
  const renderApplicable = successful && !inconclusive;
  const empty = (v: NonNullable<typeof last>) =>
    v.textChars < 5 &&
    v.mediaElements === 0 &&
    v.visibleElements === 0 &&
    !v.complexVisual &&
    !v.loader &&
    !v.genericLoader;
  const tail = o.samples.slice(-3);
  const observedFullWindow =
    !!last && last.atMs >= (o.navigationMs ?? 0) + s.renderTimeoutMs - 100;
  const blank =
    renderApplicable &&
    observedFullWindow &&
    tail.length >= 3 &&
    tail.every(empty) &&
    last.readyState === "complete";
  results.push(
    result(
      "OS-PDP-003",
      inconclusive
        ? "INCONCLUSIVE"
        : !successful
          ? "NOT_APPLICABLE"
          : blank
            ? "FAIL"
            : last &&
                (last.productSignal ||
                  last.textChars >= 40 ||
                  last.mediaElements > 0)
              ? "PASS"
              : "INCONCLUSIVE",
      blank
        ? "HTTP reușit, dar la sfârșitul ferestrei de randare nu există text, imagini sau elemente vizibile."
        : inconclusive
          ? "Randarea nu a putut fi evaluată fiabil."
          : "Semnalele vizuale sunt evaluate împreună; conținutul complex sau insuficient rămâne inconcludent.",
      { samples: tail, renderTimeoutMs: s.renderTimeoutMs },
    ),
  );
  const persistentLoader =
    !!s.loaderSelector &&
    observedFullWindow &&
    tail.length >= 3 &&
    tail.every((v) => v.loader && (v.loaderBlocking || !v.productSignal)) &&
    !!last &&
    (last.loaderBlocking || last.textChars < 200);
  results.push(
    result(
      "OS-PDP-004",
      inconclusive
        ? "INCONCLUSIVE"
        : !successful
          ? "NOT_APPLICABLE"
          : persistentLoader
            ? "FAIL"
            : o.usableMs !== null
              ? "PASS"
              : "INCONCLUSIVE",
      persistentLoader
        ? "Loaderul configurat a rămas vizibil, fără conținut de produs utilizabil, până la limita de randare."
        : o.usableMs !== null
          ? "Pagina a ajuns la o stare vizibilă stabilă."
          : "Nu există suficiente dovezi pentru confirmarea unei încărcări infinite.",
      { loaderSelector: s.loaderSelector, samples: tail },
    ),
  );
  let mismatch = false;
  try {
    const final = new URL(o.finalUrl);
    mismatch =
      !!s.expectedDomain &&
      final.hostname.toLowerCase() !== s.expectedDomain.toLowerCase();
    if (s.expectedUrl) {
      const expected = new URL(s.expectedUrl);
      mismatch ||=
        final.origin !== expected.origin ||
        final.pathname.replace(/\/$/, "") !==
          expected.pathname.replace(/\/$/, "");
    }
  } catch {
    /* no valid final document */
  }
  const redirectToError =
    o.redirects.length > 1 &&
    (missing || (o.httpStatus ?? 0) >= 500 || last?.softError);
  results.push(
    result(
      "OS-PDP-006",
      barrier
        ? "INCONCLUSIVE"
        : o.redirectError || mismatch || redirectToError
          ? "FAIL"
          : o.httpStatus === null
            ? "INCONCLUSIVE"
            : "PASS",
      o.redirectError ??
        (mismatch
          ? "Destinația finală diferă de configurația așteptată."
          : redirectToError
            ? "Lanțul de redirecturi se termină într-o pagină de eroare."
            : "Nu a fost identificat un redirect invalid."),
      {
        redirects: o.redirects,
        expectedDomain: s.expectedDomain,
        expectedUrl: s.expectedUrl,
      },
    ),
  );
  results.push(
    result(
      "OS-PDP-009",
      inconclusive
        ? "INCONCLUSIVE"
        : !successful
          ? "NOT_APPLICABLE"
          : last?.softError
            ? "FAIL"
            : "PASS",
      last?.softError
        ? "Un mesaj de eroare vizibil și contextual înlocuiește conținutul produsului."
        : inconclusive
          ? "Conținutul nu a putut fi verificat fiabil."
          : "Nu a fost identificată o pagină de eroare în locul produsului.",
      { softError: last?.softError ?? null, selectorError: o.selectorError },
    ),
  );
  results.push(
    result(
      "OS-PDP-010",
      inconclusive || o.usableMs === null
        ? "INCONCLUSIVE"
        : o.usableMs > s.slowThresholdMs
          ? "WARNING"
          : "PASS",
      o.usableMs === null
        ? "Momentul de conținut utilizabil nu a putut fi determinat."
        : `Conținut vizibil stabil după ${Math.round(o.usableMs)} ms; prag configurat ${s.slowThresholdMs} ms.`,
      {
        navigationMs: o.navigationMs,
        domContentLoadedMs: o.domContentLoadedMs,
        usableMs: o.usableMs,
        totalMs: o.totalMs,
        slowThresholdMs: s.slowThresholdMs,
      },
    ),
  );
  return results;
}
export function overall(rules: RuleResult[]): Verdict {
  for (const status of ["FAIL", "WARNING", "INCONCLUSIVE", "PASS"] as const)
    if (rules.some((r) => r.status === status)) return status;
  return "NOT_APPLICABLE";
}
