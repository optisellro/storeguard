import { PanelLeft, ShieldCheck, X } from "lucide-react";
import { navigation } from "../app/navigation";

export function Sidebar({
  active,
  collapsed,
  mobileOpen,
  scannerOnline,
  onNavigate,
  onToggle,
  onCloseMobile,
}: {
  active: string;
  collapsed: boolean;
  mobileOpen: boolean;
  scannerOnline: boolean | null;
  onNavigate: (path: string) => void;
  onToggle: () => void;
  onCloseMobile: () => void;
}) {
  const iconOnly = collapsed && !mobileOpen;
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
      <nav className="side-nav">
        <p className="side-group-label static">Module</p>
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              className={`nav${isActive ? " on" : ""}`}
              onClick={() => onNavigate(item.path)}
              title={iconOnly ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={15} strokeWidth={1.8} />
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
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
