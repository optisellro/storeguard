import { DatabaseSync } from "node:sqlite";
import { Umzug } from "umzug";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type {
  Scan,
  Settings,
  Store,
} from "../../../packages/contracts/src/index.js";
import { defaults } from "../../../packages/contracts/src/index.js";
export async function openDatabase(directory: string) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, "storeguard.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY)",
  );
  const migrator = new Umzug({
    context: db,
    logger: undefined,
    storage: {
      executed: async () =>
        (
          db.prepare("SELECT name FROM migrations ORDER BY name").all() as {
            name: string;
          }[]
        ).map((r) => r.name),
      logMigration: async ({ name }) => {
        db.prepare("INSERT INTO migrations VALUES (?)").run(name);
      },
      unlogMigration: async ({ name }) => {
        db.prepare("DELETE FROM migrations WHERE name=?").run(name);
      },
    },
    migrations: [
      {
        name: "001-initial",
        up: async () => {
          db.exec(
            "CREATE TABLE IF NOT EXISTS scans(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);",
          );
        },
        down: async () => {
          throw new Error("Rollback distructiv dezactivat.");
        },
      },
      {
        // Stores isolate every scan. Earlier test scans had no store and are removed.
        name: "002-stores",
        up: async () => {
          db.exec(
            "DELETE FROM scans; ALTER TABLE scans ADD COLUMN store_id TEXT; CREATE INDEX IF NOT EXISTS scans_store ON scans(store_id); CREATE TABLE IF NOT EXISTS stores(id TEXT PRIMARY KEY, data TEXT NOT NULL);",
          );
          rmSync(path.join(directory, "evidence"), {
            recursive: true,
            force: true,
          });
        },
        down: async () => {
          throw new Error("Rollback distructiv dezactivat.");
        },
      },
    ],
  });
  await migrator.up();
  const put = (scan: Scan) => {
    db.prepare(
      "INSERT INTO scans(id,store_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, store_id=excluded.store_id",
    ).run(scan.id, scan.storeId ?? null, JSON.stringify(scan));
  };
  const all = (): Scan[] =>
    (
      db.prepare("SELECT data FROM scans ORDER BY rowid DESC").all() as {
        data: string;
      }[]
    ).map((row) => JSON.parse(row.data));
  // Interrupted work is terminal, never silently re-scanned on startup.
  for (const row of db.prepare("SELECT data FROM scans").all() as {
    data: string;
  }[]) {
    const scan: Scan = JSON.parse(row.data);
    if (["RUNNING", "QUEUED"].includes(scan.state)) {
      rmSync(path.join(directory, "evidence", `${scan.id}-preview.jpg`), {
        force: true,
      });
      put({
        ...scan,
        phase: null,
        preview: false,
        state: "FAILED",
        finishedAt: new Date().toISOString(),
        error: "Aplicația a fost oprită înainte de finalizarea scanării.",
      });
    }
  }
  const parseAll = (rows: unknown[]) =>
    (rows as { data: string }[]).map((row) => JSON.parse(row.data));
  return {
    put,
    all,
    byStore: (storeId: string): Scan[] =>
      parseAll(
        db
          .prepare(
            "SELECT data FROM scans WHERE store_id=? ORDER BY rowid DESC",
          )
          .all(storeId),
      ),
    stores: (): Store[] =>
      parseAll(db.prepare("SELECT data FROM stores ORDER BY rowid").all()),
    store: (id: string): Store | null => {
      const row = db.prepare("SELECT data FROM stores WHERE id=?").get(id) as
        | { data: string }
        | undefined;
      return row ? JSON.parse(row.data) : null;
    },
    putStore: (store: Store) => {
      db.prepare(
        "INSERT INTO stores(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      ).run(store.id, JSON.stringify(store));
    },
    /** Removes the store, its scans and their evidence files. */
    deleteStore: (id: string) => {
      const ids = (
        db.prepare("SELECT id FROM scans WHERE store_id=?").all(id) as {
          id: string;
        }[]
      ).map((r) => r.id);
      for (const scanId of ids)
        for (const suffix of [".png", "-preview.jpg"])
          rmSync(path.join(directory, "evidence", `${scanId}${suffix}`), {
            force: true,
          });
      db.prepare("DELETE FROM scans WHERE store_id=?").run(id);
      db.prepare("DELETE FROM stores WHERE id=?").run(id);
    },
    get: (id: string): Scan | null => {
      const row = db.prepare("SELECT data FROM scans WHERE id=?").get(id) as
        | { data: string }
        | undefined;
      return row ? JSON.parse(row.data) : null;
    },
    settings: (): Settings => {
      const row = db.prepare("SELECT data FROM settings WHERE id=1").get() as
        | { data: string }
        | undefined;
      // Older saved settings may lack newer fields; defaults fill them in.
      return row ? { ...defaults, ...JSON.parse(row.data) } : defaults;
    },
    saveSettings: (settings: Settings) => {
      db.prepare(
        "INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      ).run(JSON.stringify(settings));
    },
    close: () => db.close(),
  };
}
export type Database = Awaited<ReturnType<typeof openDatabase>>;
