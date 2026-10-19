import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  PanelLeft,
  Plus,
  Settings2,
  ShieldCheck,
  Store as StoreIcon,
  X,
} from "lucide-react";
import type { Store } from "../../../../packages/contracts/src/index";
import { modules } from "../app/navigation";

export function Sidebar({
  stores,
  store,
  activeModule,
  route,
  collapsed,
  mobileOpen,
  scannerOnline,
  onNavigate,
  onToggle,
  onCloseMobile,
}: {
  stores: Store[];
  store: Store | null;
  activeModule: string | null;
  route: string;
  collapsed: boolean;
  mobileOpen: boolean;
  scannerOnline: boolean | null;
  onNavigate: (path: string) => void;
  onToggle: () => void;
  onCloseMobile: () => void;
}) {
  const iconOnly = collapsed && !mobileOpen;
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    addEventListener("mousedown", close);
    return () => removeEventListener("mousedown", close);
  }, [menu]);
  const go = (path: string) => {
    setMenu(false);
    onNavigate(path);
  };
  return (
    <aside
      className={`sidebar${iconOnly ? " is-collapsed" : ""}${mobileOpen ? " is-open" : ""}`}
      aria-label="Navigare principală"
    >
      <div className="side-top">
        <a
          className="brand"
          href="#/stores"
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
      <div className="store-picker" ref={ref}>
        <button
          className="store-switch"
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label="Alege magazinul"
          title={iconOnly ? (store?.name ?? "Alege magazinul") : undefined}
          onClick={() => setMenu(!menu)}
        >
          <span className="store-avatar">
            {store ? (
              store.name.slice(0, 1).toUpperCase()
            ) : (
              <StoreIcon size={12} />
            )}
          </span>
          <span className="store-text">
            <strong>{store?.name ?? "Alege un magazin"}</strong>
            <small>{store?.domain ?? `${stores.length} magazine`}</small>
          </span>
          <ChevronsUpDown size={13} className="store-chev" />
        </button>
        {menu && (
          <div className="menu" role="menu">
            <p className="menu-label">Magazine</p>
            {stores.map((s) => (
              <button
                key={s.id}
                role="menuitem"
                className="menu-item"
                onClick={() => go(`/s/${s.id}`)}
              >
                <span className="store-avatar sm">
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="menu-text">
                  <strong>{s.name}</strong>
                  <small>{s.domain}</small>
                </span>
                {store?.id === s.id && <Check size={13} />}
              </button>
            ))}
            <div className="menu-sep" />
            <button
              role="menuitem"
              className="menu-item"
              onClick={() => go("/stores")}
            >
              <Plus size={14} /> Adaugă sau administrează magazine
            </button>
          </div>
        )}
      </div>
      <nav className="side-nav">
        <p className="side-group-label static">Module</p>
        {modules.map((m) => {
          const Icon = m.icon;
          const on = activeModule === m.id;
          return (
            <button
              key={m.id}
              className={`nav${on ? " on" : ""}`}
              disabled={!store}
              onClick={() => store && onNavigate(m.path(store.id))}
              title={
                iconOnly
                  ? m.label
                  : !store
                    ? "Alege mai întâi un magazin"
                    : undefined
              }
              aria-current={on ? "page" : undefined}
            >
              <Icon size={15} strokeWidth={1.8} />
              <span className="nav-label">{m.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="side-bottom">
        <button
          className={`nav${route === "/stores" ? " on" : ""}`}
          onClick={() => onNavigate("/stores")}
          title={iconOnly ? "Magazine" : undefined}
        >
          <StoreIcon size={15} strokeWidth={1.8} />
          <span className="nav-label">Magazine</span>
        </button>
        <button
          className={`nav${route === "/settings" ? " on" : ""}`}
          onClick={() => onNavigate("/settings")}
          title={iconOnly ? "Setări scanare" : undefined}
        >
          <Settings2 size={15} strokeWidth={1.8} />
          <span className="nav-label">Setări scanare</span>
        </button>
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
