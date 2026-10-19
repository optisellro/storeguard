# PDP – Diagnostic tehnic · cele 32 de funcționalități

Stare la motorul **2.0.0**. „Testat” înseamnă un test automat cu un scenariu controlat, pozitiv sau negativ, care rulează în CI. Nicio funcționalitate nu este marcată ca implementată doar pentru că apare în interfață.

## Cum se colectează datele

O singură vizită a paginii, într-un singur browser Chromium, alimentează toate verificările sintetice:

| Sursă | Ce oferă | Unde |
| --- | --- | --- |
| Script de instrumentare instalat înaintea scripturilor paginii | LCP, CLS (ferestre de sesiune), FCP, sarcini lungi, operațiuni respinse netratate, încălcări CSP, înregistrări de service worker | `packages/pdp-availability/src/instrument.ts` |
| Evenimentele Playwright | erori JavaScript, mesaje de consolă, cereri finalizate/eșuate cu timpi, răspunsuri JSON | `scanner.ts` |
| Navigation și Resource Timing | TTFB, DOMContentLoaded, load, fișiere care blochează afișarea | `instrument.ts` |
| Analiză pură, fără browser | probleme grupate, severitate, texte pentru client, starea fiecărei funcționalități | `diagnostics.ts` |

După ce produsul devine utilizabil, pagina mai este observată `settleMs` (implicit 3 s), pentru erori și cereri apărute târziu.

**Nu sunt raportate ca erori ale magazinului:** cererile oprite chiar de StoreGuard (POST, WebSocket, adrese private), navigările anulate (`ERR_ABORTED`), răspunsurile 401/403/429 ale serviciilor și mesajele „Failed to load resource” (acoperite deja de verificările de rețea).

**Severitate:** „Problemă confirmată” numai când există un efect observabil (serviciu propriu căzut, fișier propriu lipsă, pagină afectată vizibil, metrică „slabă”). Erorile JavaScript și semnalele de la servicii externe sunt „Avertizare” până la corelarea cu un efect.

## Status

| # | Funcționalitate | Tip | Status | Note |
| --- | --- | --- | --- | --- |
| 01 | Disponibilitatea paginii | Synthetic | Implementat și testat | Regulile existente OS-PDP-001/002/006/009 |
| 02 | Încărcare completă | Synthetic | Implementat și testat | OS-PDP-003/004 |
| 03 | Timpi de încărcare | Synthetic | Implementat și testat | TTFB, DOMContentLoaded, load, produs utilizabil |
| 04 | Core Web Vitals | Synthetic | Implementat parțial | LCP și CLS testate; INP necesită vizitatori reali (RUM) și nu este estimat |
| 05 | Primul conținut afișat | Synthetic | Implementat și testat | FCP cu pragurile oficiale |
| 06 | Erori JavaScript | Synthetic | Implementat și testat | Grupate după mesaj normalizat; sursa și momentul păstrate |
| 07 | Operațiuni eșuate netratate | Synthetic | Implementat și testat | Nu sunt numărate a doua oară ca erori JavaScript |
| 08 | Erori în consolă | Synthetic | Implementat și testat | Deduplicare; avertismentele sunt doar numărate |
| 09 | Servicii (API) eșuate | Synthetic | Implementat și testat | 5xx/eșec propriu = problemă; 404 = avertizare; 401/403/429 ignorate |
| 10 | Integritatea datelor | Synthetic | Implementat parțial | Detectează JSON invalid declarat ca JSON. Contractele per endpoint (erori ascunse în HTTP 200) necesită configurare, etapa de administrare |
| 11 | Fișiere care nu se încarcă | Synthetic | Implementat și testat | Script/stil propriu = problemă; font sau serviciu extern = avertizare |
| 12 | Analiza cererilor (waterfall) | Synthetic | Implementat, testat parțial | Waterfall testat; pragurile pentru cereri lente (> 3 s) și fișiere care blochează afișarea (> 1,5 s) nu au încă fixture dedicat |
| 13 | Servicii externe | Synthetic | Implementat și testat | Categorii (analiză, marketing, chat, recenzii, plăți, CDN…), erori, întârzieri |
| 14 | Blocarea browserului | Synthetic | Implementat și testat | Sarcini lungi, timp total de blocare aproximativ |
| 15 | Procesor și memorie | Advanced | Neimplementat | Etapa 4, scanare suplimentară |
| 16 | Inițializarea aplicației | Synthetic | Implementat și testat | Semnale reale de hidratare React/Vue/Next.js din consolă și erori |
| 17 | CORS / CSP / conținut mixt | Synthetic | Implementat și testat | CSP testat cu fixture; CORS și conținut mixt după mesajele browserului |
| 18 | Cereri repetate excesiv | Synthetic | Implementat și testat | Separă polling-ul regulat (≤ 2/s, interval constant) de rafale |
| 19 | Service worker și cache | Synthetic | Implementat parțial | Scannerul blochează service worker-ele din motive de securitate; se detectează înregistrarea și erorile, nu comportamentul din cache |
| 20 | Rețea lentă | Synthetic | Neimplementat | Etapa 4, profil de rețea separat |
| 21 | Alte browsere | Synthetic | Neimplementat | Etapa 4, Firefox și WebKit (WebKit nu echivalează un iPhone real) |
| 22 | Performanță pe mobil | Synthetic | Neimplementat | Etapa 4, emulare mobilă |
| 23 | Regresii de performanță | Historical | Necesită istoric | Etapa 3 |
| 24 | Monitorizare vizitatori reali | RUM | Necesită SDK | Etapa RUM |
| 25 | Hartă de clickuri | RUM | Necesită SDK | Instrument de analiză, nu verificare |
| 26 | Hartă de scroll | RUM | Necesită SDK | Instrument de analiză, nu verificare |
| 27 | Clickuri repetate | RUM | Necesită SDK | Semnal de fricțiune |
| 28 | Clickuri fără efect | RUM | Necesită SDK | Semnal de fricțiune |
| 29 | Reluarea sesiunilor | RUM | Necesită SDK | Cu mascare, eșantionare, consimțământ |
| 30 | Corelarea erorilor | Historical | Implementat parțial | Grupare după sursă în aceeași verificare; corelarea între sesiuni necesită RUM |
| 31 | Creșteri bruște de erori | Historical | Necesită SDK | Necesită volum de sesiuni reale |
| 32 | Regresii tehnice | Historical | Necesită istoric | Etapa 3 |

## Biblioteci

Fără dependențe noi în această etapă. Playwright (Apache 2.0) era deja în proiect, iar metricile sunt colectate prin API-urile native ale browserului, cu aceleași definiții și praguri ca biblioteca `web-vitals` (Apache 2.0). Lighthouse, rrweb și heatmap.js vor fi evaluate în etapele în care aduc o contribuție funcțională (audit la cerere, respectiv RUM).

## Limitări cunoscute

- Măsurători de laborator: un browser desktop, fără limitare de rețea, o singură sesiune anonimă. Nu reprezintă experiența tuturor vizitatorilor.
- Scannerul blochează cererile care trimit date (POST), WebSocket și service worker-ele. Funcțiile magazinului care depind de ele pot genera erori secundare; de aceea erorile JavaScript rămân „Avertizare” până la confirmarea unui efect vizibil.
- Textele erorilor sunt trunchiate și adresele sunt redactate (fără query). Nu sunt stocate corpuri de răspuns, cookies sau HTML.
- Separarea administrator/client și activarea/dezactivarea detectoarelor sunt planificate pentru etapa de administrare a modulelor.
