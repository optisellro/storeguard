# Reguli · v1.0.0

Toate regulile primesc observațiile reale ale browserului și configurația scanării. HTTP 200 nu certifică funcționarea produsului. Absența dovezilor nu produce PASS. Blocarea de acces, anti-bot sau o problemă a mediului produc INCONCLUSIVE.

## OS-PDP-001 · Pagină indisponibilă

**FAIL:** HTTP 500–599, navigare eșuată, timeout de navigare, DNS sau conexiune/TLS eșuată. Raportul păstrează codul specific (`ENOTFOUND`, `ECONNREFUSED`, `net::ERR_CERT_...`, `NAVIGATION_TIMEOUT`). Răspunsurile sintetice ale proxy-ului nu sunt tratate ca răspunsuri HTTP ale magazinului.

**INCONCLUSIVE:** browser absent, acces privat blocat, timeout global, barieră anti-bot/autentificare/acces. **PASS:** răspuns principal primit fără eroare de disponibilitate observată. O buclă de redirect este evaluată separat la OS006.

Dovezi: status document principal, codul erorii, timpi și captură unde este posibil. Teste: unitare pentru 500/503/599, DNS, conexiune, certificat și timeout; integrare Chromium pentru 500/503, conexiune, TLS și timeout.

## OS-PDP-002 · Produs negăsit

**FAIL:** HTTP 404/410 și `expectedActive=true`. **WARNING:** HTTP 404/410 fără așteptare declarată. **INCONCLUSIVE:** nu există un răspuns verificabil sau există o barieră. **PASS:** nu a fost observat 404/410 într-o navigare verificabilă.

Dovezi: status HTTP și opțiunea explicită a utilizatorului. Teste unitare pentru 404 și 410 în ambele stări; integrare 404 activ / necunoscut.

## OS-PDP-003 · Pagină goală

**FAIL** numai dacă sunt îndeplinite împreună: HTTP 2xx; fereastră completă de observare; minimum trei probe finale; document `complete`; practic niciun text vizibil, element vizibil sau imagine încărcată; fără canvas/iframe/SVG ambiguu și fără indicator de încărcare.

Vizibilitatea combină geometria din viewport, CSS, opacitate și `checkVisibility`; media se verifică și prin încărcarea imaginii. Nu se bazează exclusiv pe `body.innerText.length`. **PASS:** conținut vizibil suficient. **INCONCLUSIVE:** conținut puțin, complex sau cereri blocate fără produs detectabil. **NOT_APPLICABLE:** răspuns non-2xx.

Dovezi: ultimele trei probe cu număr caractere, elemente, media, suprafață, readyState și durată. Teste: pagină complet goală, conținut ascuns, canvas ambiguu, SPA întârziată, cookie banner.

## OS-PDP-004 · Încărcare persistentă

**FAIL:** loader CSS configurat explicit, vizibil în toate cele trei probe finale după fereastra completă, fără produs utilizabil și cu conținut redus; sau loader dominant care acoperă minimum 60% din viewport și interceptează pointerul. **PASS:** semnale de produs stabile și fără loader dominant. **INCONCLUSIVE:** spinner generic, selector invalid sau dovezi insuficiente. **NOT_APPLICABLE:** răspuns non-2xx.

Un spinner lângă produs nu este singur suficient pentru FAIL. Evoluția este observată la ~250 ms. Stabilitatea necesită trei observații cu semnătură similară pe minimum 450 ms. Nu se așteaptă `networkidle`.

Dovezi: selector, probe de evoluție, semnale produs, loader dominant și momentul conținutului utilizabil. Teste: loader persistent, spinner cu produs, overlay dominant, polling permanent.

## OS-PDP-006 · Redirect invalid

**FAIL:** buclă detectată de Chromium, depășirea limitei configurate, lanț terminat cu 404/410/5xx/soft error sau destinație diferită de configurație. Domeniul configurat se compară exact, fără wildcard; destinația URL compară origin și cale normalizată, fără query/fragment.

HTTP→HTTPS, www→non-www și localizarea nu sunt considerate greșeli în absența unei așteptări explicite. **INCONCLUSIVE:** destinație blocată sau navigare fără răspuns verificabil. **PASS:** navigare verificabilă fără abatere.

Dovezi: URL-uri redactate și statusuri pentru fiecare document principal, destinație finală și configurație. Teste: normalizare HTTP→HTTPS în logica regulii, redirect HTTP local în Chromium, buclă, limită configurată, redirect către eroare sau metadata blocată.

## OS-PDP-009 · Pagină de eroare cu HTTP 200

**FAIL:** răspuns HTTP 2xx cu selector de eroare vizibil sau mesaj contextual într-un heading/alert/conținut principal scurt, în absența semnalelor de produs. Mesajele configurabile sunt comparate fără diferențiere de majuscule, fără regex arbitrar. Defaulturile includ mesaje complete precum „Something went wrong”.

Simplul cuvânt `error` în footer/sursă nu produce incident. **INCONCLUSIVE:** selector invalid, acces blocat sau conținut neevaluabil. **NOT_APPLICABLE:** HTTP non-2xx. **PASS:** conținut verificabil fără semnal contextual de eroare.

Dovezi: rezultatul detectorului și setările salvate; nu se păstrează textul brut al paginii. Teste: selector explicit, text contextual, cuvânt necontextual `error`, anti-bot.

## OS-PDP-010 · Încărcare lentă

**WARNING:** momentul de conținut utilizabil detectat depășește pragul configurat. **PASS:** moment detectat sub prag. **INCONCLUSIVE:** moment nedeterminabil, barieră de acces sau randare neevaluabilă.

Momentul „utilizabil” este începutul seriei de trei probe stabile: H1 vizibil + text principal >40 caractere + media vizibilă sau semnal de preț/produs, fără blocare sau loader dominant. Este o euristică pentru acest MVP, nu verificarea funcțională a butoanelor și nici LCP. Pagini cu structură neobișnuită pot rămâne inconcludente.

Dovezi: `navigationMs`, `domContentLoadedMs`, `usableMs`, `totalMs` și prag. Primele trei sunt relative la începutul navigării; totalul include întregul job. Ceas: `performance.now()`. Teste: PDP normal, SPA întârziată peste prag, timp necunoscut, polling, timeout global.

## Verdict și limite

Verificările de randare nu pot certifica întregul catalog sau magazinul. Pagina este observată doar în viewportul desktop, într-o singură sesiune anonimă. Capturile maschează inputuri, zone `[data-private]` și adrese email detectabile; protecția datelor arbitrare din conținut nu este garantată.

Fișiere de teste: `tests/rules.test.ts`, `tests/security.test.ts`, `tests/integration/scanner.test.ts`, `tests/integration/api.test.ts`, `tests/e2e/app.spec.ts`.
