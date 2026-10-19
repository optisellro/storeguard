import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, LoaderCircle, Menu, Plus } from "lucide-react";
import {
  defaults,
  type Scan,
  type Settings,
} from "../../../../packages/contracts/src/index";
import { Sidebar } from "../components/Sidebar";
import { api } from "../lib/api";
import { PDP_MODULE, pdpTabs, type PdpTab } from "./navigation";
import { PdpModule } from "../pages/PdpModule";
import { NewScan } from "../pages/NewScan";
import { Report } from "../pages/Report";

const SIDEBAR_KEY = "storeguard.sidebarCollapsed";

const readRoute = () => location.hash.slice(1) || "/";

/** Audit PDP tab for a route; null for routes outside the module tabs. */
function pdpTab(route: string): PdpTab | null {
  if (route === "/") return "overview";
  return pdpTabs.find((t) => t.path === route)?.id ?? null;
}

export function App() {
  const [route, setRoute] = useState(readRoute);
  const [scans, setScans] = useState<Scan[]>([]);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  const navigate = (path: string) => {
    location.hash = path;
    setMobileOpen(false);
  };
  const toggle = () =>
    setCollapsed((value) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, value ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !value;
    });

  useEffect(() => {
    const listener = () => {
      setRoute(readRoute());
      window.scrollTo({ top: 0 });
    };
    addEventListener("hashchange", listener);
    return () => removeEventListener("hashchange", listener);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await api<Scan[]>("/scans");
        if (!active) return;
        setScans(data);
        setLoaded(true);
        setError("");
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    const health = () =>
      api<{ ok: boolean }>("/health")
        .then((h) => active && setOnline(h.ok))
        .catch(() => active && setOnline(false));
    void refresh();
    void health();
    const scanTimer = setInterval(refresh, 1500);
    const healthTimer = setInterval(health, 15000);
    void api<Settings>("/settings")
      .then((s) => active && setSettings(s))
      .catch(() => {});
    return () => {
      active = false;
      clearInterval(scanTimer);
      clearInterval(healthTimer);
    };
  }, []);

  const onCreated = (scan: Scan) =>
    setScans((current) => [scan, ...current.filter((s) => s.id !== scan.id)]);

  const tab = pdpTab(route);
  const leaf =
    route === "/new"
      ? "Verificare nouă"
      : route.startsWith("/scan/")
        ? "Raport"
        : (pdpTabs.find((t) => t.id === tab)?.label ?? "Prezentare");

  let page: ReactNode;
  if (!loaded && !error)
    page = (
      <div className="loading">
        <LoaderCircle size={16} className="spin" /> Se încarcă datele…
      </div>
    );
  else if (route === "/new")
    page = <NewScan navigate={navigate} onCreated={onCreated} />;
  else if (route.startsWith("/scan/")) {
    const scan = scans.find((s) => s.id === route.split("/")[2]);
    page = scan ? (
      <Report
        scan={scan}
        scans={scans}
        navigate={navigate}
        onCreated={onCreated}
      />
    ) : (
      <div className="loading">Verificarea nu a fost găsită.</div>
    );
  } else
    page = (
      <PdpModule
        tab={tab ?? "overview"}
        scans={scans}
        settings={settings}
        onSaveSettings={setSettings}
        navigate={navigate}
      />
    );

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <Sidebar
        active={PDP_MODULE.id}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        scannerOnline={online}
        onNavigate={navigate}
        onToggle={toggle}
        onCloseMobile={() => setMobileOpen(false)}
      />
      {mobileOpen && (
        <div className="scrim" onClick={() => setMobileOpen(false)} />
      )}
      <div className="main">
        <header className="topbar">
          <button
            className="icon-btn mobile-only"
            aria-label="Deschide meniul"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={16} />
          </button>
          <nav className="crumbs" aria-label="Locație">
            <button
              className="crumb-link"
              onClick={() => navigate(PDP_MODULE.path)}
            >
              {PDP_MODULE.label}
            </button>
            <span className="sep">/</span>
            <strong>{leaf}</strong>
          </nav>
          <div className="topbar-right">
            {route !== "/new" && (
              <button
                className="btn primary sm"
                onClick={() => navigate("/new")}
              >
                <Plus size={13} />
                <span className="hide-sm">Verificare nouă</span>
              </button>
            )}
          </div>
        </header>
        <main className="content">
          {error && (
            <div role="alert" className="banner-error">
              <AlertTriangle size={14} />
              {error} Verifică dacă scannerul local rulează (portul 4310).
            </div>
          )}
          {page}
        </main>
      </div>
    </div>
  );
}
