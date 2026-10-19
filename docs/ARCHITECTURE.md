# Arhitectură

## Componente

| Director                    | Responsabilitate                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                  | React + Vite; shell modular (`app/navigation.ts`), pagini, componente, grafice SVG, traducerea rezultatelor în limbajul clientului (`lib/report.ts`) |
| `apps/api`                  | Fastify, API localhost, coadă în memorie, persistență SQLite și migrare Umzug                                                                        |
| `packages/contracts`        | Contracte TypeScript, validare Zod, setări, redactarea URL-urilor                                                                                    |
| `packages/pdp-availability` | Motor autonom Playwright, rețea verificată, observații vizuale și reguli pure                                                                        |
| `tests/fixtures`            | Server controlat pentru teste; nu este un backend de rezultate demonstrative                                                                         |

Dependențele sunt administrate prin pnpm, cu lockfile. Frontendul nu importă Playwright sau codul bazei de date. Motorul nu depinde de Fastify sau React.

## Flux

1. `POST /api/scans` validează URL-ul și așteptarea de produs activ; salvează configurația și scanarea QUEUED.
2. Coada admite maximum două scanări globale implicit și maximum una pe domeniu registrabil, inclusiv subdomenii; `tldts` folosește Public Suffix List. Capacitate implicită 20 de joburi în așteptare.
3. Jobul devine RUNNING. `scanPage(url, settings, expectedActive, evidenceFile)` validează DNS și pornește un proxy egress local temporar și Chromium headless.
4. Context izolat 1440 × 900, fără service workers, conturi persistente sau ignorarea certificatelor. Routingul verifică cererile, iar proxy-ul validează rezoluția și conectează socketul la IP-ul verificat.
5. Navigarea colectează documentul principal, redirecturile, cauza tehnică și DOMContentLoaded. Nu există request HTTP preliminar către magazin; verificarea inițială este DNS.
6. Observarea la ~250 ms analizează conținutul vizibil, media, loader, semnale de produs, blocare și eroare contextuală. Nu utilizează `networkidle` și nu acționează butoane.
7. Șapte funcții de evaluare generează PASS / FAIL / WARNING / INCONCLUSIVE / NOT_APPLICABLE, explicații și date numerice. O captură este încercată pentru rezultate care necesită atenție, dacă pagina nu este sensibilă/blocată.
8. Închiderea contextului, browserului, proxy-ului și socketurilor este obligatorie. Raportul final este salvat, UI îl citește prin polling.

Pe parcurs, motorul emite faza curentă (`PREPARING` → `NAVIGATING` → `OBSERVING` → `EVALUATING` → `EVIDENCE`), salvată ca `phase` pe scanare și folosită de animația de progres.

Analiza paginii rulează ca script autonom în `page.evaluate`. Aplicația rulează prin `tsx`, care injectează helperul `__name` în funcțiile compilate; scriptul definește local acest helper, altfel fiecare observație eșua. Eroarea de analiză este păstrată în `observation.analysisError`, iar testul `tests/integration/runtime.test.ts` rulează scannerul exact prin `node --import tsx`.

Deadline-ul global acoperă pornirea, navigarea și observarea; resursele sunt eliberate și după întrerupere. Erorile scannerului devin stări terminale. O oprire neașteptată lasă înregistrări QUEUED/RUNNING recuperate ca FAILED la următoarea pornire. Coada nu este reexecutată automat.

## Contractul motorului

`scanPage` primește URL-ul real, setările validate și calea dovezii, returnând `Report`. Acesta include `Observation`, `RuleResult[]`, verdict agregat, `engineVersion` și `rulesVersion`. `NetworkPolicy` este un parametru injectabil pentru teste; aplicația utilizează întotdeauna politica implicită fără acces privat.

Verdict agregat, în ordinea priorității: FAIL, WARNING, INCONCLUSIVE, PASS. Fiecare regulă rămâne vizibilă separat. Starea jobului (ex. BLOCKED) este distinctă de verdictul regulilor. Nu există scor procentual fictiv.

## API

| Metodă    | Cale                        | Comportament                                                    |
| --------- | --------------------------- | --------------------------------------------------------------- |
| GET       | `/api/health`               | Starea API-ului local                                           |
| GET       | `/api/scans`                | Istoric real, ordonat descrescător                              |
| POST      | `/api/scans`                | Creează job; răspuns 202; 400 intrare invalidă, 429 coadă plină |
| GET       | `/api/scans/:id`            | Starea și raportul scanării                                     |
| GET       | `/api/scans/:id/screenshot` | PNG existent, asociat ID-ului; altfel 404                       |
| GET / PUT | `/api/settings`             | Citește / validează și salvează pragurile                       |

API-ul ascultă fix pe `127.0.0.1:4310`; acceptă numai Host localhost/127.0.0.1 și originile locale definite. Vite este proxy same-origin pe portul 5173. Nu este un serviciu public autentificat.

## Persistență

`node:sqlite`, WAL, busy timeout 5 s. Umzug menține tabelul `migrations`; migrarea inițială creează `scans` și `settings`. ID-ul scanării este UUID; payloadul persistat este JSON versionat prin versiunea motorului/regulilor. Capturile sunt fișiere separate servite numai după validarea UUID-ului și existenței flagului de dovadă.

Nu sunt stocate corpuri HTTP, DOM brut, cookies, tokenuri, headere de autentificare sau console logs. Query-urile și fragmentele URL sunt eliminate înainte de persistență. Istoricul complet este returnat de API; pentru volume mari va fi necesară paginarea și o politică de retenție.

## Protecții și limite

- Politica IP respinge adrese private, loopback, link-local, metadata, rețele rezervate, multicast și mecanisme IPv6 de translatare relevante. Dacă DNS oferă inclusiv o adresă interzisă, întregul rezultat este respins.
- Fiecare conexiune proxy rezolvă DNS și conectează IP-ul verificat direct; browserul nu face o a doua rezoluție pentru socketul respectiv. Astfel schimbarea DNS între verificare și conectare nu redirecționează socketul spre o adresă privată.
- HTTP este transmis prin proxy, HTTPS utilizează CONNECT cu certificatul verificat de Chromium pentru hostname-ul original. Nu există MITM sau dezactivarea TLS în scanner.
- Redirecturile sunt observate și plafonate; răspunsurile care depășesc limita determină închiderea paginii. Un răspuns suplimentar poate fi deja în tranzit când se închide browserul.
- GET/HEAD exclusiv; cererile de mutare a datelor, WebSockets și service workers sunt blocate. Nu se apasă butoane, nu se acceptă cookies, nu se trimit formulare și nu se fac retry-uri automate.
- Proxy-ul limitează timpii de socket. Concurența și coada sunt limitate. Un deployment public necesită limite OS pentru CPU/memorie și egress firewall independent; IP filtering la nivel de aplicație nu poate înlocui izolarea browserului.
- Contextul este anonim, dar conținutul public poate conține date personale. Mascarea capturilor este parțială și documentată; publicarea sau partajarea dovezilor nu este implementată.

## Documentații oficiale consultate

- [Playwright: Network](https://playwright.dev/docs/network)
- [Playwright: BrowserContext](https://playwright.dev/docs/api/class-browsercontext)
- [Playwright: Route](https://playwright.dev/docs/api/class-route)
- [Fastify: Server](https://fastify.dev/docs/latest/Reference/Server/)
- [Node.js: SQLite](https://nodejs.org/api/sqlite.html)
- [Tailwind CSS: Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Radix: Checkbox](https://www.radix-ui.com/primitives/docs/components/checkbox)

- [Umzug](https://github.com/sequelize/umzug)
- [tldts](https://github.com/remusao/tldts)
