# StoreGuard · PDP Availability & Loading v1.0

Aplicație locală pentru auditarea **disponibilității și încărcării unei pagini de produs reale**. Introduci URL-ul, backendul deschide efectiv pagina cu Chromium, apoi salvează raportul și dovezile. Fără rezultate demonstrative în dashboard, fără plugin în magazin, fără AI, fără conturi de magazin.

**Modul unic:** `PDP Availability & Loading`. Șapte reguli: OS-PDP-001, 002, 003, 004, 006, 009, 010. Nu sunt implementate testarea Add to Cart, variante, checkout, SEO, abonamente sau conturi multiple.

## Cerințe

- **Node.js 24 LTS** recomandat; minim 22.13.0 pentru `node:sqlite` (poate emite avertisment experimental pe această versiune).
- Git și pnpm 11.25.0. `npm install --global pnpm@11.25.0` dacă pnpm lipsește.
- Chromium instalat prin Playwright. Nu sunt necesare API keys, baze de date externe sau secrete.
- Windows, macOS sau Linux compatibil cu versiunea Playwright din lockfile. Testarea executată aici a fost pe Linux; Windows/macOS necesită validare separată.

## Instalare · Windows PowerShell

```powershell
git clone https://github.com/optisellro/storeguard.git
cd storeguard
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm browser:install
pnpm dev
```

## Instalare · macOS / Linux

```bash
git clone https://github.com/optisellro/storeguard.git
cd storeguard
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm browser:install
pnpm dev
```

### Eroare `Failed to switch pnpm` / `ENOENT` pe macOS

Dacă pnpm încearcă să pornească un executabil absent din `Library/pnpm/.tools`, rulează versiunea JavaScript direct prin npm/npx. Astfel nu folosești launcherul pnpm care indică fișierul lipsă și nu trebuie să ștergi instalările globale sau datele aplicației.

Din directorul `storeguard`, cu Node.js cel puțin 22.13 (recomandat 24):

```bash
node --version
npx --yes pnpm@11.25.0 --version
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx --yes pnpm@11.25.0 browser:install
npx --yes pnpm@11.25.0 dev
```

Comanda de versiune trebuie să afișeze `11.25.0`. Pentru această variantă, continuă să prefixezi comenzile pnpm cu `npx --yes pnpm@11.25.0`. Mecanismul direct a fost verificat în mediul Linux; confirmarea rulării pe Mac rămâne locală. Vezi și [documentația npm pentru npx](https://docs.npmjs.com/cli/v11/commands/npx/).

Pe un Linux nou, dacă lipsesc biblioteci de sistem:

```bash
pnpm exec playwright install --with-deps chromium
```

Comanda poate solicita drepturi administrative pentru pachetele sistemului. Nu dezactiva verificarea certificatelor pentru a rezolva erori de instalare sau navigare.

**Interfață:** <http://127.0.0.1:5173>

**API:** <http://127.0.0.1:4310/api/health>

`pnpm dev` pornește ambele procese și actualizează aplicația la modificarea surselor. Oprește cu Ctrl+C. Pentru build și rulare fără watch:

```bash
pnpm build
pnpm start
```

API-ul și frontendul ascultă exclusiv pe `127.0.0.1`. Porturile sunt fixe pentru a păstra protecțiile Host/Origin explicite. Nu expune porturile pe internet sau prin tuneluri: MVP-ul nu are autentificare.

## Prima pagină reală

1. Deschide interfața și selectează **Scanare nouă**.
2. Introdu adresa publică exactă a produsului tău (`https://...`). Adresele locale/private și porturile nestandard sunt blocate.
3. Bifează **Acest produs ar trebui să fie activ și accesibil** numai dacă această așteptare este cunoscută. Fără bifă, HTTP 404/410 generează WARNING.
4. Apasă **Scanează pagina**. Progresul este actualizat automat; raportul grupează regulile după rezultat.
5. Deschide detaliile tehnice, lanțul de redirecturi și captura, dacă a putut fi colectată.

`Setări scanare` permite configurarea timeouturilor, pragului lent, limitei redirecturilor, selectorilor CSS, mesajelor specifice și destinației așteptate. Sunt salvate pentru scanările viitoare. Un selector CSS invalid produce INCONCLUSIVE în raport, nu PASS.

## Timpi și interpretare

- **Navigare:** de la inițierea `page.goto` până la DOMContentLoaded sau eroarea de navigare.
- **DOMContentLoaded:** primul eveniment al documentului principal, măsurat de la inițierea navigării.
- **Conținut utilizabil:** prima probă a unei serii stabile de trei observații, minimum 450 ms, cu semnale vizibile de produs. Este o euristică documentată, nu o măsurătoare Core Web Vitals.
- **Durată totală:** include pornirea browserului, rezoluția DNS, observarea, dovezile și închiderea resurselor.
- Duratele folosesc un ceas monoton. Un moment de randare necunoscut rămâne `null` / **Nedeterminat**.

Praguri inițiale: navigare 15 s; observare randare după navigare 20 s; avertizare conținut utilizabil >8 s; deadline global 45 s. Deadline-ul întrerupe operațiunea; eliberarea resurselor poate adăuga un timp scurt după deadline. Aceste valori sunt configurabile și nu sunt standarde universale.

## Date locale

SQLite: `data/storeguard.sqlite`. Capturi: `data/evidence/<scan-id>.png`. Migrarea inițială este gestionată de **Umzug**. Datele și capturile sunt excluse din Git. Raportul conține versiunea motorului, regulilor și setările folosite. Scanările întrerupte sunt marcate FAILED la repornire, fără retry automat.

Variabile opționale, înainte de pornire:

| Variabilă                  | Implicit             | Semnificație                                                                      |
| -------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `STOREGUARD_DATA_DIR`      | `data`               | Directorul bazei de date și dovezilor                                             |
| `STOREGUARD_CONCURRENCY`   | `2`                  | Scanări active global; interval 1–4                                               |
| `STOREGUARD_QUEUE_SIZE`    | `20`                 | Scanări în așteptare; interval 1–100                                              |
| `STOREGUARD_CHROMIUM_PATH` | browserul Playwright | Cale către Chromium administrat local; utilă în medii cu instalare restricționată |

Exemplu PowerShell: `$env:STOREGUARD_CONCURRENCY = "1"`; Linux/macOS: `export STOREGUARD_CONCURRENCY=1`. Nu există o variabilă pentru dezactivarea SSRF. Excepțiile pentru fixture-uri sunt injectate exclusiv în teste și nu sunt expuse prin API.

## Testare

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:e2e
```

`pnpm test` rulează testele unitare și scanările Chromium pe servere locale controlate. `pnpm test:e2e` pornește aplicația și verifică interfața reală. Testul UI adaugă o scanare locală blocată, reală, în directorul de date folosit; pentru izolare setează `STOREGUARD_DATA_DIR` la un director temporar. Serverele fixture nu sunt oferite utilizatorilor și nu înlocuiesc URL-urile reale în producție.

## Limitări relevante

- Detectorii vizuali sunt euristici conservatoare. Canvas, iframe, cookie banner dominant, pagini fără semnale detectabile de produs sau CSS neobișnuit pot produce INCONCLUSIVE.
- „PASS” înseamnă că regula a putut fi verificată în această sesiune; nu certifică funcționarea întregului magazin. HTTP 200 singur nu certifică randarea.
- CAPTCHA, anti-bot, autentificarea și HTTP 401/403/407/429 sunt bariere de evaluare, nu defecte PDP confirmate. Nu există mecanisme de ocolire.
- Sunt permise doar GET/HEAD; POST, WebSockets, service workers, popups și descărcări sunt restricționate. Magazinele care depind de acestea pot fi evaluate incomplet; cererile blocate apar în raport.
- Validarea DNS este repetată și conexiunile egress sunt fixate la IP-ul verificat. Pentru utilizare publică sunt obligatorii izolarea proceselor, firewall egress care blochează rețelele interne/metadata, autentificare și limite de resurse. Controalele aplicației nu reprezintă o izolare completă a unui browser care execută cod extern.
- URL-urile salvate pierd query, fragment, credențiale și unele segmente sensibile. URL-ul complet este folosit doar în memoria jobului pentru navigarea reală. Nu se salvează HTML, răspunsuri API, cookies, tokenuri sau mesaje console ale magazinului.
- Capturile de probleme sunt locale, cu inputuri, zone private explicite și adrese email mascate; autentificarea și paginile blocate nu sunt capturate. Mascarea nu garantează eliminarea tuturor datelor personale dintr-o pagină arbitrară. Înainte de utilizarea cu clienți reali trebuie definită o politică de retenție și verificare a dovezilor.
- Nu a fost furnizat un URL PDP public pentru validare externă în această etapă. Scanarea unui magazin real rămâne de verificat pe adresa autorizată a utilizatorului.

Vezi [arhitectura](docs/ARCHITECTURE.md), [regulile](docs/RULES.md) și [testele executate](docs/TEST-RESULTS.md).
