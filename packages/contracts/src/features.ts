/**
 * Registry of the 32 PDP technical capabilities.
 * `availability` is the honest implementation state; the UI never presents
 * a capability as checked when it is not.
 */
export type FeatureKind = "synthetic" | "rum" | "historical" | "advanced";
export type FeatureAvailability =
  | "full"
  | "partial"
  | "history"
  | "planned"
  | "sdk";
export type DiagnosticTab =
  | "performance"
  | "network"
  | "browsers"
  | "experience"
  | "insights";

export interface FeatureDef {
  id: string;
  name: string;
  short: string;
  kind: FeatureKind;
  tabs: DiagnosticTab[];
  availability: FeatureAvailability;
}

export const pdpFeatures: FeatureDef[] = [
  {
    id: "01",
    name: "Disponibilitatea paginii",
    short:
      "Pagina răspunde, fără erori de server, redirecturi greșite sau pagini de eroare.",
    kind: "synthetic",
    tabs: ["performance"],
    availability: "full",
  },
  {
    id: "02",
    name: "Încărcare completă",
    short: "Pagina nu rămâne albă sau blocată în încărcare.",
    kind: "synthetic",
    tabs: ["performance"],
    availability: "full",
  },
  {
    id: "03",
    name: "Timpi de încărcare",
    short: "Răspunsul serverului, structura paginii, încărcarea completă.",
    kind: "synthetic",
    tabs: ["performance"],
    availability: "full",
  },
  {
    id: "04",
    name: "Core Web Vitals",
    short:
      "Afișarea conținutului principal (LCP) și stabilitatea paginii (CLS).",
    kind: "synthetic",
    tabs: ["performance"],
    availability: "partial",
  },
  {
    id: "05",
    name: "Primul conținut afișat",
    short: "Cât durează până apare ceva pe ecran (FCP).",
    kind: "synthetic",
    tabs: ["performance"],
    availability: "full",
  },
  {
    id: "06",
    name: "Erori JavaScript",
    short: "Erori ale scripturilor care pot opri componente ale paginii.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "full",
  },
  {
    id: "07",
    name: "Operațiuni eșuate netratate",
    short: "Operațiuni din pagină care eșuează fără ca pagina să le trateze.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "full",
  },
  {
    id: "08",
    name: "Erori în consola browserului",
    short: "Mesajele de eroare relevante, deduplicate.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "full",
  },
  {
    id: "09",
    name: "Servicii (API) eșuate",
    short: "Cereri de date care eșuează sau răspund cu erori.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "full",
  },
  {
    id: "10",
    name: "Integritatea datelor primite",
    short: "Răspunsuri de date în format invalid.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "partial",
  },
  {
    id: "11",
    name: "Fișiere care nu se încarcă",
    short: "Scripturi, stiluri sau fonturi lipsă.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "full",
  },
  {
    id: "12",
    name: "Analiza cererilor (waterfall)",
    short: "Cereri lente și fișiere care întârzie afișarea.",
    kind: "synthetic",
    tabs: ["network", "performance"],
    availability: "full",
  },
  {
    id: "13",
    name: "Servicii externe",
    short: "Analytics, chat, marketing, widgeturi: erori și întârzieri.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "full",
  },
  {
    id: "14",
    name: "Blocarea browserului",
    short: "Scripturi care blochează pagina și întârzie reacția ei.",
    kind: "synthetic",
    tabs: ["performance"],
    availability: "full",
  },
  {
    id: "15",
    name: "Procesor și memorie",
    short: "Consumul de resurse al paginii.",
    kind: "advanced",
    tabs: ["performance"],
    availability: "planned",
  },
  {
    id: "16",
    name: "Inițializarea aplicației",
    short: "Erori de hidratare și inițializare (React, Vue, Next.js).",
    kind: "synthetic",
    tabs: ["network"],
    availability: "full",
  },
  {
    id: "17",
    name: "Resurse blocate de securitate",
    short: "Cereri blocate de CORS, politica de securitate sau conținut mixt.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "full",
  },
  {
    id: "18",
    name: "Cereri repetate excesiv",
    short: "Bucle de cereri și retry-uri necontrolate, separat de polling.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "full",
  },
  {
    id: "19",
    name: "Service worker și cache",
    short:
      "Erori de service worker; comportamentul din cache nu este încă testat.",
    kind: "synthetic",
    tabs: ["network"],
    availability: "partial",
  },
  {
    id: "20",
    name: "Rețea lentă",
    short: "Comportamentul paginii pe o conexiune lentă.",
    kind: "synthetic",
    tabs: ["performance"],
    availability: "planned",
  },
  {
    id: "21",
    name: "Alte browsere",
    short: "Probleme care apar doar în Firefox sau WebKit.",
    kind: "synthetic",
    tabs: ["browsers"],
    availability: "planned",
  },
  {
    id: "22",
    name: "Performanță pe mobil",
    short: "Emulare mobilă cu resurse limitate.",
    kind: "synthetic",
    tabs: ["performance"],
    availability: "planned",
  },
  {
    id: "23",
    name: "Regresii de performanță",
    short: "Încetiniri față de scanările anterioare.",
    kind: "historical",
    tabs: ["browsers", "performance"],
    availability: "history",
  },
  {
    id: "24",
    name: "Monitorizare vizitatori reali",
    short: "Erori și performanță din sesiunile clienților.",
    kind: "rum",
    tabs: ["experience"],
    availability: "sdk",
  },
  {
    id: "25",
    name: "Hartă de clickuri",
    short: "Unde dau click vizitatorii.",
    kind: "rum",
    tabs: ["experience"],
    availability: "sdk",
  },
  {
    id: "26",
    name: "Hartă de scroll",
    short: "Cât din pagină este văzut.",
    kind: "rum",
    tabs: ["experience"],
    availability: "sdk",
  },
  {
    id: "27",
    name: "Clickuri repetate",
    short: "Semnale de frustrare: clickuri rapide în aceeași zonă.",
    kind: "rum",
    tabs: ["experience"],
    availability: "sdk",
  },
  {
    id: "28",
    name: "Clickuri fără efect",
    short: "Clickuri care nu produc nimic vizibil.",
    kind: "rum",
    tabs: ["experience"],
    availability: "sdk",
  },
  {
    id: "29",
    name: "Reluarea sesiunilor",
    short: "Reconstituirea unei sesiuni, cu date sensibile mascate.",
    kind: "rum",
    tabs: ["experience"],
    availability: "sdk",
  },
  {
    id: "30",
    name: "Corelarea erorilor",
    short: "Grupează problemele care au aceeași sursă.",
    kind: "historical",
    tabs: ["insights"],
    availability: "partial",
  },
  {
    id: "31",
    name: "Creșteri bruște de erori",
    short: "Volum anormal de erori față de istoric.",
    kind: "historical",
    tabs: ["insights"],
    availability: "sdk",
  },
  {
    id: "32",
    name: "Regresii tehnice",
    short: "Erori noi și resurse care au început să eșueze.",
    kind: "historical",
    tabs: ["browsers", "insights"],
    availability: "history",
  },
];

/** Official web.dev thresholds (good ≤ first value, poor > second value). */
export const vitalThresholds = {
  ttfb: [800, 1800],
  fcp: [1800, 3000],
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  inp: [200, 500],
} as const;
