# Rezultate de testare

Data: **19 octombrie 2026**. Validarea a fost executată în mediul Linux de dezvoltare, cu **Node.js 24.19.0**, **pnpm 11.25.0**, **Playwright 1.64.1** și **Chromium 153.0.8010.0** instalat local.

## Comenzi și rezultate

| Comandă             | Rezultat                                                             |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm install`      | Dependențe instalate și lockfile generat                             |
| `pnpm typecheck`    | PASS, fără erori TypeScript                                          |
| `pnpm build`        | PASS, bundle Vite generat                                            |
| `pnpm test`         | **76 / 76 PASS**, patru fișiere de teste                             |
| `pnpm test:e2e`     | **1 / 1 PASS**, aplicație pornită efectiv și utilizată prin Chromium |
| `pnpm format:check` | PASS                                                                 |

Browserul local a fost selectat prin `STOREGUARD_CHROMIUM_PATH`. Variabila are rol de cale executabil, nu dezactivează politica de rețea sau TLS. Rularea E2E a folosit un director separat prin `STOREGUARD_DATA_DIR`.

Comenzi echivalente pentru repetarea validării cu browserul standard:

```bash
pnpm install --frozen-lockfile
pnpm browser:install
pnpm build
pnpm test
pnpm test:e2e
pnpm format:check
```

**Limitare a mediului:** `pnpm browser:install` a fost încercat, dar serverul de descărcare a furnizat o arhivă invalidă/incompletă în acest mediu. Testele nu au fost înlocuite cu simulări; au folosit Chromium-ul local deja disponibil. Compatibilitatea cu browserul descărcat implicit de această versiune Playwright trebuie confirmată separat; CI este configurat să instaleze browserul standard și să execute aceleași verificări. Rezultatul CI nu este presupus în acest raport.

## Acoperire

| Zonă                 | Teste | Ce a fost verificat                                                                                                                                           |
| -------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reguli pure          |    21 | Toate cele șapte reguli, statusuri pozitive/negative, HTTP→HTTPS permis, așteptarea pentru 404/410, cauze tehnice, lipsa dovezilor, praguri și date sensibile |
| Securitate           |    22 | IP-uri private/metadata/IPv6, scheme, credențiale, porturi, DNS mixt, reevaluare după rebinding și refuz în proxy                                             |
| Scanner real         |    28 | Navigare și randare Chromium pe pagini locale controlate; lista de mai jos                                                                                    |
| API / SQLite / coadă |     5 | Validare și Host/Origin, raport terminal blocat, persistența raportului și capturii după restart, recuperare după întrerupere, limite de concurență/coadă     |
| Interfață E2E        |     1 | Dashboard, salvare setări, scanare reală blocată de politică, șapte reguli afișate, query sensibil eliminat, reload, meniu mobil și istoric                   |

Scenarii Chromium: PDP normal, HTTP 500/503, conexiune refuzată, handshake TLS invalid, 404 activ/necunoscut, pagină goală și conținut ascuns, loader persistent, loader dominant peste produs, spinner lângă produs, redirect normal, buclă, plafon configurat de redirecturi, timeout global și următoarea scanare funcțională, redirect către HTTP 500, soft error configurat, cuvântul `error` necontextual, SPA întârziată cu avertizare de timp, polling permanent, cookie banner, CAPTCHA, autentificare, HTTP 403, redirect metadata, resurse private și POST blocate, timeout navigare și selector invalid.

**HTTP→HTTPS normal:** testat în logica regulii; navigarea reală de redirect a fost verificată local prin HTTP→HTTP. Un redirect real HTTP→HTTPS cu certificat public valid nu a fost executat în acest mediu. Cazul de TLS invalid a fost verificat printr-un server HTTPS controlat cu handshake nereușit.

Probele de DNS/conexiune/certificat din testele unitare verifică interpretarea codurilor tehnice; testele de integrare confirmă separat comportamentul Chromium pentru conexiune și TLS. Nu este pretinsă testarea tuturor erorilor posibile ale infrastructurii.

## Probleme remediate în validare

- Forwardarea HTTP prin proxy a fost corectată pentru a elimina headerele proxy fără valori `undefined`.
- Spinnerul lângă produs și loaderul dominant sunt diferențiate, evitând clasificarea falsă a unui produs vizibil ca încărcare infinită.
- Destinațiile de redirect blocate sunt marcate ca bariere ale scannerului, fără atribuirea unui defect magazinului. Răspunsurile sintetice ale proxy-ului nu sunt prezentate ca statusuri primite de la magazin.
- Limita de redirecturi se aplică și lanțurilor HTTP gestionate intern de browser.
- Timpii de navigare/randare sunt separați de pornirea browserului și de durata totală.
- Pornirea API-ului utilizează `node --import tsx`, evitând dependența de socketul IPC al CLI-ului tsx în mediul restricționat.
- Formularul adaugă scanarea în starea UI imediat după creare, înaintea următorului polling.

## Verificare vizuală

Capturi inspectate pentru dashboard fără scanări: desktop **1440 × 1000** și mobil **390 × 844**. La mobil: lățimea documentului 390 px, fără depășire orizontală; sidebar închis în afara viewportului și accesibil prin meniu. Capturile de QA nu sunt incluse ca rezultate de audit sau date demonstrative în aplicație.

## Ce nu a fost verificat

- **Niciun URL PDP public nu a fost furnizat pentru audit extern în această cerere.** Nu a fost scanat un magazin ales arbitrar. Motorul primește și navighează URL-uri reale, dar validarea pe magazinul utilizatorului rămâne de făcut.
- Instalare și rulare efectivă pe Windows/macOS. Instrucțiunile și comenzile sunt compatibile ca structură; nu sunt declarate teste executate pe aceste sisteme.
- Detectare universală pentru toate platformele eCommerce, browsere mobile, regiuni sau sesiuni autentificate. Conținutul complex și barierele sunt raportate conservator.
- Eliminarea garantată a tuturor datelor personale din capturi. Există mascarea câmpurilor/zonelor private și emailurilor, plus excluderea paginilor de autentificare/blocate; este necesară o politică suplimentară înainte de utilizarea publică.
- Deployment public, autentificare, billing, module SEO, checkout, Add to Cart, variante, AI și integrări marketplace: în afara scopului, neimplementate.
