import {
  LayoutDashboard,
  AlertTriangle,
  History,
  PackageSearch,
  LayoutGrid,
  Home,
  ShoppingCart,
  CreditCard,
  ClipboardList,
  Search,
  Palette,
  Smartphone,
  Gauge,
  Globe2,
  CalendarClock,
  Bell,
  Plug,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Route for implemented items; items without a route are shown as "În curând". */
  path?: string;
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const PDP_MODULE = {
  id: "pdp-availability",
  path: "/modules/pdp-availability",
  label: "Pagini de produs",
  title: "Disponibilitate pagini de produs",
  description:
    "Verifică dacă paginile de produs se deschid, se afișează complet și se încarcă suficient de repede pentru clienți.",
};

export const navigation: NavGroup[] = [
  {
    id: "general",
    label: "General",
    items: [
      {
        id: "overview",
        label: "Prezentare generală",
        icon: LayoutDashboard,
        path: "/",
      },
      { id: "issues", label: "Probleme", icon: AlertTriangle, path: "/issues" },
      {
        id: "history",
        label: "Istoric verificări",
        icon: History,
        path: "/history",
      },
    ],
  },
  {
    id: "availability",
    label: "Disponibilitate",
    items: [
      {
        id: PDP_MODULE.id,
        label: PDP_MODULE.label,
        icon: PackageSearch,
        path: PDP_MODULE.path,
      },
      {
        id: "category-pages",
        label: "Pagini de categorie",
        icon: LayoutGrid,
        description:
          "Listări de produse goale, filtre și paginare care nu funcționează.",
      },
      {
        id: "homepage",
        label: "Pagina principală",
        icon: Home,
        description:
          "Disponibilitatea și afișarea paginii principale a magazinului.",
      },
    ],
  },
  {
    id: "functionality",
    label: "Funcționalitate",
    items: [
      {
        id: "cart",
        label: "Coș de cumpărături",
        icon: ShoppingCart,
        description:
          "Adăugarea în coș, modificarea cantităților și calculul totalului.",
      },
      {
        id: "checkout",
        label: "Flux de comandă",
        icon: CreditCard,
        description: "Parcurgerea completă a comenzii, până la pasul de plată.",
      },
      {
        id: "forms",
        label: "Formulare",
        icon: ClipboardList,
        description:
          "Contact, newsletter și cont client: trimitere și confirmare.",
      },
      {
        id: "search",
        label: "Căutare",
        icon: Search,
        description: "Rezultatele căutării interne pentru produse cunoscute.",
      },
    ],
  },
  {
    id: "experience",
    label: "Design și experiență",
    items: [
      {
        id: "visual",
        label: "Aspect vizual",
        icon: Palette,
        description: "Modificări neașteptate de design între două verificări.",
      },
      {
        id: "mobile",
        label: "Versiune mobilă",
        icon: Smartphone,
        description:
          "Afișarea corectă pe telefon: elemente suprapuse sau ascunse.",
      },
    ],
  },
  {
    id: "performance",
    label: "Performanță și SEO",
    items: [
      {
        id: "speed",
        label: "Viteză magazin",
        icon: Gauge,
        description: "Evoluția vitezei de încărcare pe principalele pagini.",
      },
      {
        id: "seo",
        label: "SEO tehnic",
        icon: Globe2,
        description:
          "Indexare, linkuri rupte și redirecturi la nivel de magazin.",
      },
    ],
  },
  {
    id: "setup",
    label: "Configurare",
    items: [
      {
        id: "schedules",
        label: "Programări",
        icon: CalendarClock,
        description: "Verificări automate, la intervale stabilite de tine.",
      },
      {
        id: "alerts",
        label: "Alerte",
        icon: Bell,
        description:
          "Notificări pe email sau Slack când o verificare găsește o problemă.",
      },
      {
        id: "integrations",
        label: "Integrări",
        icon: Plug,
        description:
          "Conectare cu platforma magazinului pentru importul paginilor.",
      },
      { id: "settings", label: "Setări", icon: Settings2, path: "/settings" },
    ],
  },
];

export const allItems = navigation.flatMap((g) =>
  g.items.map((item) => ({ ...item, group: g.label })),
);

export const comingSoonPath = (id: string) => `/soon/${id}`;
