import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, LoaderCircle, Menu, Plus } from "lucide-react";
import {
  defaults,
  type Scan,
  type Settings,
} from "../../../../packages/contracts/src/index";
import { Sidebar } from "../components/Sidebar";
import { api } from "../lib/api";
import { latestPerPage } from "../lib/stats";
import { scanHealth } from "../lib/report";
import { allItems, PDP_MODULE } from "./navigation";
import { Overview } from "../pages/Overview";
import { PdpModule } from "../pages/PdpModule";
import { NewScan } from "../pages/NewScan";
import { Report } from "../pages/Report";
import { Issues, History, ComingSoon } from "../pages/Lists";
import { SettingsPage } from "../pages/SettingsPage";

const SIDEBAR_KEY = "storeguard.sidebarCollapsed";

const readRoute = () => location.hash.slice(1) || "/";

function activeItem(route: string): string {
  if (route === "/") return "overview";
  if (route.startsWith("/soon/")) return route.split("/")[2] ?? "";
  if (
    route === "/new" ||
    route.startsWith("/scan/") ||
    route.startsWith(PDP_MODULE.path)
  )
    return PDP_MODULE.id;
  return route.slice(1).split("/")[0];
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

  const issues = latestPerPage(scans).filter((s) =>
    ["fail", "warn"].includes(scanHealth(s)),
  ).length;
  const current = activeItem(route);
  const item = allItems.find((i) => i.id === current);
  const leaf =
    route === "/new"
      ? "Verificare nouă"
      : route.startsWith("/scan/")
        ? "Raport"
        : null;

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
  } else if (route.startsWith(PDP_MODULE.path)) {
    const sub = route.slice(PDP_MODULE.path.length);
    page = (
      <PdpModule
        tab={
          sub === "/history" ? "history" : sub === "/rules" ? "rules" : "pages"
        }
        scans={scans}
        navigate={navigate}
      />
    );
  } else if (route === "/issues")
    page = <Issues scans={scans} navigate={navigate} />;
  else if (route === "/history")
    page = <History scans={scans} navigate={navigate} />;
  else if (route === "/settings")
    page = <SettingsPage settings={settings} onSave={setSettings} />;
  else if (route.startsWith("/soon/"))
    page = <ComingSoon id={route.split("/")[2] ?? ""} navigate={navigate} />;
  else
    page = <Overview scans={scans} settings={settings} navigate={navigate} />;

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <Sidebar
        active={current}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        issues={issues}
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
            <span>{item?.group ?? "General"}</span>
            <span className="sep">/</span>
            {leaf ? (
              <>
                <button
                  className="crumb-link"
                  onClick={() => navigate(item?.path ?? "/")}
                >
                  {item?.label}
                </button>
                <span className="sep">/</span>
                <strong>{leaf}</strong>
              </>
            ) : (
              <strong>{item?.label ?? "Prezentare generală"}</strong>
            )}
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
