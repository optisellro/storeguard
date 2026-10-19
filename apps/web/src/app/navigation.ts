import { PackageSearch, type LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
}

export const PDP_MODULE = {
  id: "pdp",
  path: "/pdp",
  label: "Audit PDP",
  title: "Audit PDP",
  description:
    "Verifică dacă paginile de produs se deschid, se afișează complet și se încarcă suficient de repede pentru clienți.",
};

/** Sidebar entries. Add a module here only when it is implemented. */
export const navigation: NavItem[] = [
  {
    id: PDP_MODULE.id,
    label: PDP_MODULE.label,
    icon: PackageSearch,
    path: PDP_MODULE.path,
  },
];

export type PdpTab = "overview" | "pages" | "history" | "rules" | "settings";

export const pdpTabs: { id: PdpTab; label: string; path: string }[] = [
  { id: "overview", label: "Prezentare", path: PDP_MODULE.path },
  { id: "pages", label: "Pagini", path: `${PDP_MODULE.path}/pages` },
  { id: "history", label: "Istoric", path: `${PDP_MODULE.path}/history` },
  { id: "rules", label: "Ce verificăm", path: `${PDP_MODULE.path}/rules` },
  { id: "settings", label: "Setări", path: `${PDP_MODULE.path}/settings` },
];
