import { DatabaseSync } from "node:sqlite";
import { Umzug } from "umzug";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { Scan, Settings } from "../../../packages/contracts/src/index.js";
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
    ],
  });
  await migrator.up();
  const put = (scan: Scan) => {
    db.prepare(
      "INSERT INTO scans(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    ).run(scan.id, JSON.stringify(scan));
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
  return {
    put,
    all,
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
      return row ? JSON.parse(row.data) : defaults;
    },
    saveSettings: (settings: Settings) => {
      db.prepare(
        "INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      ).run(JSON.stringify(settings));
    },
    close: () => db.close(),
  };
}
export type Store = Awaited<ReturnType<typeof openDatabase>>;
