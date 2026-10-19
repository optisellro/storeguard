import { PackageSearch, type LucideIcon } from "lucide-react";

export interface ModuleItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Route inside the current store. */
  path: (storeId: string) => string;
}

/** Sidebar "Module" section. Add a module here only when it is implemented. */
export const modules: ModuleItem[] = [
  {
    id: "pdp",
    label: "PDP – Pagina de produs",
    icon: PackageSearch,
    path: (storeId) => `/s/${storeId}`,
  },
];
