import { useMemo, useState } from "react";
import { ChevronDown, PanelLeft, Search, ShieldCheck, X } from "lucide-react";
import { navigation, comingSoonPath, type NavItem } from "../app/navigation";

const STORAGE_KEY = "storeguard.closedGroups";

const readClosed = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export function Sidebar({
  active,
  collapsed,
  mobileOpen,
  issues,
  scannerOnline,
  onNavigate,
  onToggle,
  onCloseMobile,
}: {
  active: string;
  collapsed: boolean;
  mobileOpen: boolean;
  issues: number;
  scannerOnline: boolean | null;
  onNavigate: (path: string) => void;
  onToggle: () => void;
  onCloseMobile: () => void;
}) {
  const [closed, setClosed] = useState<string[]>(readClosed);
  const [filter, setFilter] = useState("");
  const toggleGroup = (id: string) => {
    const next = closed.includes(id)
      ? closed.filter((g) => g !== id)
      : [...closed, id];
    setClosed(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: keep in memory */
    }
  };
  const query = filter.trim().toLowerCase();
  const groups = useMemo(
    () =>
      navigation
        .map((g) => ({
          ...g,
          items: query
            ? g.items.filter((i) => i.label.toLowerCase().includes(query))
            : g.items,
        }))
        .filter((g) => g.items.length),
    [query],
  );
  const iconOnly = collapsed && !mobileOpen;
  const go = (item: NavItem) =>
    onNavigate(item.path ?? comingSoonPath(item.id));
  return (
    <aside
      className={`sidebar${iconOnly ? " is-collapsed" : ""}${mobileOpen ? " is-open" : ""}`}
      aria-label="Navigare principală"
    >
      <div className="side-top">
        <a
          className="brand"
          href="#/"
          onClick={onCloseMobile}
          aria-label="StoreGuard"
        >
          <span className="brand-mark">
            <ShieldCheck size={14} strokeWidth={2.4} />
          </span>
          <span className="brand-name">StoreGuard</span>
        </a>
        <button
          className="icon-btn mobile-only"
          aria-label="Închide meniul"
          onClick={onCloseMobile}
        >
          <X size={16} />
        </button>
      </div>
      <div className="store-switch" title="Magazin">
        <span className="store-avatar">M</span>
        <span className="store-text">
          <strong>Magazinul meu</strong>
          <small>Instanță locală</small>
        </span>
      </div>
      {!iconOnly && (
        <label className="side-search">
          <Search size={13} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Caută modul"
            aria-label="Caută modul"
          />
        </label>
      )}
      <nav className="side-nav">
        {groups.map((group) => {
          const open = !!query || !closed.includes(group.id) || iconOnly;
          return (
            <div className="side-group" key={group.id}>
              {iconOnly ? (
                <span className="side-sep" />
              ) : (
                <button
                  className="side-group-label"
                  aria-expanded={open}
                  onClick={() => toggleGroup(group.id)}
                >
                  {group.label}
                  <ChevronDown size={12} className={open ? "" : "rot"} />
                </button>
              )}
              {open &&
                group.items.map((item) => {
                  const Icon = item.icon;
                  const soon = !item.path;
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      className={`nav${isActive ? " on" : ""}${soon ? " soon" : ""}`}
                      onClick={() => go(item)}
                      title={
                        iconOnly
                          ? item.label + (soon ? " · în curând" : "")
                          : undefined
                      }
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon size={15} strokeWidth={1.8} />
                      <span className="nav-label">{item.label}</span>
                      {!iconOnly && item.id === "issues" && issues > 0 && (
                        <span className="nav-count">{issues}</span>
                      )}
                      {!iconOnly && soon && (
                        <span className="nav-soon">În curând</span>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
        {!groups.length && <p className="side-empty">Niciun modul găsit.</p>}
      </nav>
      <div className="side-bottom">
        <div className="scanner-state" title="Scannerul local">
          <span
            className={`dot ${scannerOnline ? "h-ok" : scannerOnline === false ? "h-fail" : "h-unknown"}`}
          />
          <span className="nav-label">
            {scannerOnline === false ? "Scanner indisponibil" : "Scanner activ"}
          </span>
        </div>
        <button
          className="nav collapse-btn desktop-only"
          onClick={onToggle}
          aria-label={collapsed ? "Extinde meniul" : "Restrânge meniul"}
          title={collapsed ? "Extinde meniul" : undefined}
        >
          <PanelLeft size={15} strokeWidth={1.8} />
          <span className="nav-label">Restrânge meniul</span>
        </button>
      </div>
    </aside>
  );
}
