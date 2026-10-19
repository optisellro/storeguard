import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, LoaderCircle, Menu, Plus } from "lucide-react";
import {
  defaults,
  type Scan,
  type Settings,
} from "../../../../packages/contracts/src/index";
import { Sidebar } from "../components/Sidebar";
import { PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { StoreDashboard, type StoreTab } from "../pages/StoreDashboard";
import { Diagnostic } from "../pages/Diagnostic";
import { Stores, type StoreWithSummary } from "../pages/Stores";
import { SettingsPage } from "../pages/SettingsPage";

const SIDEBAR_KEY = "storeguard.sidebarCollapsed";
const LAST_STORE_KEY = "storeguard.lastStore";
const readRoute = () => location.hash.slice(1) || "/";
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};
const recall = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** /s/<store>[/pages|/history|/scan/<id>] */
function parse(route: string) {
  const m = route.match(
    /^\/s\/([0-9a-f-]{36})(?:\/(pages|history|scan\/([0-9a-f-]{36})))?$/,
  );
  if (!m) return null;
  return {
    storeId: m[1],
    tab: (m[2] === "pages" || m[2] === "history"
      ? m[2]
      : "overview") as StoreTab,
    scanId: m[3] ?? null,
  };
}

export function App() {
  const [route, setRoute] = useState(readRoute);
  const [stores, setStores] = useState<StoreWithSummary[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [scans, setScans] = useState<{ storeId: string; list: Scan[] } | null>(
    null,
  );
  const [settings, setSettings] = useState<Settings>(defaults);
  const [error, setError] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => recall(SIDEBAR_KEY) === "1");

  const navigate = (path: string) => {
    location.hash = path;
    setMobileOpen(false);
  };
  const toggle = () =>
    setCollapsed((value) => {
      remember(SIDEBAR_KEY, value ? "0" : "1");
      return !value;
    });
  const loadStores = () =>
    api<StoreWithSummary[]>("/stores")
      .then((list) => {
        setStores(list);
        setStoresLoaded(true);
        setError("");
      })
      .catch((e) => setError((e as Error).message));

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
    const health = () =>
      api<{ ok: boolean }>("/health")
        .then((h) => active && setOnline(h.ok))
        .catch(() => active && setOnline(false));
    void loadStores();
    void health();
    void api<Settings>("/settings")
      .then((s) => active && setSettings(s))
      .catch(() => {});
    const storesTimer = setInterval(loadStores, 5000);
    const healthTimer = setInterval(health, 15000);
    return () => {
      active = false;
      clearInterval(storesTimer);
      clearInterval(healthTimer);
    };
  }, []);

  const parsed = parse(route);
  const storeId = parsed?.storeId ?? null;
  const store = stores.find((s) => s.id === storeId) ?? null;

  // Scans are always loaded per store, so results of different stores never mix.
  useEffect(() => {
    if (!storeId) return;
    remember(LAST_STORE_KEY, storeId);
    let active = true;
    const refresh = () =>
      api<Scan[]>(`/stores/${storeId}/scans`)
        .then((list) => active && setScans({ storeId, list }))
        .catch((e) => active && setError((e as Error).message));
    void refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [storeId]);

  // "/" opens the last used store, or the store list.
  useEffect(() => {
    if (route !== "/" || !storesLoaded) return;
    const last = recall(LAST_STORE_KEY);
    const target = stores.find((s) => s.id === last) ?? stores[0];
    navigate(target ? `/s/${target.id}` : "/stores");
  }, [route, storesLoaded, stores]);

  const onCreated = (scan: Scan) =>
    setScans((current) =>
      current && current.storeId === scan.storeId
        ? {
            storeId: current.storeId,
            list: [scan, ...current.list.filter((s) => s.id !== scan.id)],
          }
        : current,
    );
  const storeScans = scans && scans.storeId === storeId ? scans.list : null;

  let page: ReactNode;
  let leaf = "";
  if (!storesLoaded && !error)
    page = (
      <div className="loading">
        <LoaderCircle size={16} className="spin" /> Se încarcă datele…
      </div>
    );
  else if (route === "/stores") {
    leaf = "Magazine";
    page = (
      <Stores stores={stores} navigate={navigate} onChanged={loadStores} />
    );
  } else if (route === "/settings") {
    leaf = "Setări scanare";
    page = (
      <>
        <PageHeader
          title="Setări scanare"
          description="Pragurile și semnalele folosite de verificări. Se aplică tuturor magazinelor, pentru verificările viitoare."
        />
        <SettingsPage settings={settings} onSave={setSettings} />
      </>
    );
  } else if (parsed && !store)
    page = <div className="loading">Magazinul nu există sau a fost șters.</div>;
  else if (parsed && store && !storeScans)
    page = (
      <div className="loading">
        <LoaderCircle size={16} className="spin" /> Se încarcă verificările
        magazinului…
      </div>
    );
  else if (parsed && store && storeScans) {
    leaf = parsed.scanId
      ? "Diagnostic tehnic"
      : parsed.tab === "pages"
        ? "Pagini"
        : parsed.tab === "history"
          ? "Istoric"
          : "Prezentare";
    page = parsed.scanId ? (
      <Diagnostic
        scanId={parsed.scanId}
        store={store}
        history={storeScans}
        navigate={navigate}
        onCreated={onCreated}
      />
    ) : (
      <StoreDashboard
        store={store}
        scans={storeScans}
        tab={parsed.tab}
        settings={settings}
        navigate={navigate}
        onCreated={onCreated}
      />
    );
  } else page = <div className="loading">Pagina nu există.</div>;

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <Sidebar
        stores={stores}
        store={store}
        activeModule={parsed ? "pdp" : null}
        route={route}
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
            {store && parsed ? (
              <>
                <button
                  className="crumb-link"
                  onClick={() => navigate(`/s/${store.id}`)}
                >
                  {store.name}
                </button>
                <span className="sep">/</span>
                <span>PDP – Pagina de produs</span>
                <span className="sep">/</span>
                <strong>{leaf}</strong>
              </>
            ) : (
              <strong>{leaf || "StoreGuard"}</strong>
            )}
          </nav>
          <div className="topbar-right">
            {store && parsed && (
              <button
                className="btn primary sm"
                onClick={() => navigate(`/s/${store.id}/pages`)}
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
