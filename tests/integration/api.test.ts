import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fixtureServer } from "../fixtures/server.js";
import { scanPage } from "../../packages/pdp-availability/src/scanner.js";
import { NetworkPolicy } from "../../packages/pdp-availability/src/security.js";
import { buildApp } from "../../apps/api/src/app.js";
import { openDatabase } from "../../apps/api/src/database.js";
import { ScanQueue } from "../../apps/api/src/queue.js";
import { DatabaseSync } from "node:sqlite";

type App = Awaited<ReturnType<typeof buildApp>>;
const createStore = async (app: App, domain: string, name = "Magazin test") => {
  const response = await app.inject({
    method: "POST",
    url: "/api/stores",
    payload: { name, domain },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
};
import {
  evaluate,
  overall,
} from "../../packages/pdp-availability/src/rules.js";
import {
  defaults,
  type Observation,
  type Scan,
} from "../../packages/contracts/src/index.js";
describe("API, persistență și coadă", () => {
  it("validează URL/setări, previne DNS rebinding spre API și cereri cross-origin", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sg-api-"));
    const app = await buildApp({ directory: dir });
    try {
      const storeId = await createStore(app, "example.com");
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/scans",
            payload: { storeId, url: "file:///etc/passwd" },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/scans",
            payload: { storeId, url: "https://user:secret@example.com" },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/api/settings",
            payload: { ...defaults, maxRedirects: 0 },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            url: "/api/stores",
            headers: { host: "evil.example" },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: "/api/stores",
            headers: { origin: "https://evil.example" },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await app.inject({ url: "/api/scans/not-found/screenshot" }))
          .statusCode,
      ).toBe(404);
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("scanare reală SSRF blocată este terminală și persistă după repornire", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sg-persist-"));
    let app = await buildApp({ directory: dir });
    try {
      const storeId = await createStore(app, "127.0.0.1");
      const response = await app.inject({
        method: "POST",
        url: "/api/scans",
        payload: { storeId, url: "http://127.0.0.1/private?token=secret" },
      });
      expect(response.statusCode).toBe(202);
      const id = response.json().id;
      await app.close();
      app = await buildApp({ directory: dir });
      const scan = (await app.inject(`/api/scans/${id}`)).json();
      expect(scan.state).toBe("BLOCKED");
      expect(scan.url).not.toContain("secret");
      expect(scan.report.verdict).toBe("INCONCLUSIVE");
      expect(
        (await app.inject(`/api/stores/${storeId}/scans`)).json(),
      ).toHaveLength(1);
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("raport Chromium și captură persistă și sunt servite după restart", async () => {
    const fixture = await fixtureServer(),
      dir = await mkdtemp(path.join(os.tmpdir(), "sg-report-"));
    let app = await buildApp({
      directory: dir,
      scanner: (url, settings, active, file) =>
        scanPage(
          url,
          { ...settings, renderTimeoutMs: 800 },
          active,
          file,
          new NetworkPolicy(fixture.origin),
        ),
    });
    try {
      const storeId = await createStore(app, "127.0.0.1");
      const response = await app.inject({
        method: "POST",
        url: "/api/scans",
        payload: { storeId, url: fixture.origin + "/blank" },
      });
      const id = response.json().id;
      await app.close();
      app = await buildApp({ directory: dir });
      const report = (await app.inject(`/api/scans/${id}`)).json();
      expect(report.state).toBe("COMPLETED");
      expect(
        report.report.rules.find((r: { id: string }) => r.id === "OS-PDP-003")
          .status,
      ).toBe("FAIL");
      const image = await app.inject(`/api/scans/${id}/screenshot`);
      expect(image.statusCode).toBe(200);
      expect(image.headers["content-type"]).toBe("image/png");
      expect(image.rawPayload.length).toBeGreaterThan(100);
    } finally {
      await app.close();
      await fixture.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("previzualizarea live e servită doar cât rulează scanarea, apoi ștearsă", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sg-preview-"));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let previewPath = "";
    const app = await buildApp({
      directory: dir,
      scanner: async (url, settings, active, _file, _policy, progress) => {
        progress?.phase?.("OBSERVING");
        previewPath = progress!.previewFile!;
        await mkdir(path.dirname(previewPath), { recursive: true });
        await writeFile(previewPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
        progress?.preview?.();
        await gate;
        const o: Observation = {
          httpStatus: 200,
          finalUrl: url,
          redirects: [],
          navigationMs: 10,
          domContentLoadedMs: 10,
          usableMs: null,
          totalMs: 20,
          navigationError: null,
          environmentError: null,
          securityBlocked: false,
          blockedRequests: 0,
          redirectError: null,
          samples: [],
          screenshot: false,
          selectorError: null,
          analysisError: null,
        };
        const rules = evaluate(o, settings, active);
        return {
          observation: o,
          rules,
          engineVersion: "test",
          rulesVersion: "test",
          verdict: overall(rules),
        };
      },
    });
    try {
      const storeId = await createStore(app, "example.com");
      const id = (
        await app.inject({
          method: "POST",
          url: "/api/scans",
          payload: { storeId, url: "https://example.com/produs" },
        })
      ).json().id;
      // Wait until the job has written the preview and flagged it on the scan.
      for (let i = 0; i < 200; i++) {
        if ((await app.inject(`/api/scans/${id}`)).json().preview) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      const running = (await app.inject(`/api/scans/${id}`)).json();
      expect(running.state).toBe("RUNNING");
      expect(running.phase).toBe("OBSERVING");
      expect(running.preview).toBe(true);
      const image = await app.inject(`/api/scans/${id}/preview`);
      expect(image.statusCode).toBe(200);
      expect(image.headers["content-type"]).toBe("image/jpeg");
      release();
      for (let i = 0; i < 100; i++) {
        if ((await app.inject(`/api/scans/${id}`)).json().state !== "RUNNING")
          break;
        await new Promise((r) => setTimeout(r, 10));
      }
      await new Promise((r) => setTimeout(r, 20));
      const done = (await app.inject(`/api/scans/${id}`)).json();
      expect(done.state).toBe("COMPLETED");
      expect(done.preview).toBe(false);
      expect((await app.inject(`/api/scans/${id}/preview`)).statusCode).toBe(
        404,
      );
      for (let i = 0; i < 100; i++) {
        if (
          !(await stat(previewPath).then(
            () => true,
            () => false,
          ))
        )
          break;
        await new Promise((r) => setTimeout(r, 10));
      }
      await expect(stat(previewPath)).rejects.toThrow();
    } finally {
      release();
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("recuperează RUNNING / QUEUED ca FAILED, fără retry automat", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sg-recover-"));
    let db = await openDatabase(dir);
    const scan: Scan = {
      id: "interrupted",
      storeId: "00000000-0000-4000-8000-000000000001",
      url: "https://example.com/",
      expectedActive: false,
      state: "RUNNING",
      settings: defaults,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      report: null,
      error: null,
    };
    db.put(scan);
    db.saveSettings({ ...defaults, maxRedirects: 3 });
    db.close();
    try {
      db = await openDatabase(dir);
      expect(db.get(scan.id)?.state).toBe("FAILED");
      expect(db.settings().maxRedirects).toBe(3);
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("concurență globală, exclusivitate domeniu, coadă limitată", async () => {
    const queue = new ScanQueue(2, 2);
    const active: string[] = [],
      release: (() => void)[] = [];
    const job = (domain: string) => async () => {
      active.push(domain);
      await new Promise<void>((resolve) => release.push(resolve));
    };
    queue.enqueue("shop", job("shop-1"));
    queue.enqueue("shop", job("shop-2"));
    queue.enqueue("other", job("other"));
    queue.enqueue("third", job("third"));
    expect(() => queue.enqueue("fourth", job("fourth"))).toThrow("plină");
    await Promise.resolve();
    expect(active).toEqual(["shop-1", "other"]);
    release.splice(0).forEach((fn) => fn());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(active).toContain("shop-2");
    expect(active).toContain("third");
    release.splice(0).forEach((fn) => fn());
    await queue.close();
  });
  it("magazine izolate: domeniu validat, scanări separate, duplicat refuzat, ștergere completă", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sg-stores-"));
    const app = await buildApp({
      directory: dir,
      scanner: async (url, settings, active) => {
        const o: Observation = {
          httpStatus: 200,
          finalUrl: url,
          redirects: [],
          navigationMs: 1,
          domContentLoadedMs: 1,
          usableMs: null,
          totalMs: 1,
          navigationError: null,
          environmentError: null,
          securityBlocked: false,
          blockedRequests: 0,
          redirectError: null,
          samples: [],
          screenshot: false,
          selectorError: null,
          analysisError: null,
        };
        const rules = evaluate(o, settings, active);
        return {
          observation: o,
          rules,
          engineVersion: "t",
          rulesVersion: "t",
          verdict: overall(rules),
        };
      },
    });
    try {
      const a = await createStore(
        app,
        "https://www.magazin-a.ro/",
        "Magazin A",
      );
      const b = await createStore(app, "magazin-b.ro", "Magazin B");
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/stores",
            payload: { name: "Dublură", domain: "magazin-a.ro" },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/stores",
            payload: { name: "X", domain: "nu un domeniu" },
          })
        ).statusCode,
      ).toBe(400);
      const wrong = await app.inject({
        method: "POST",
        url: "/api/scans",
        payload: { storeId: a, url: "https://magazin-b.ro/produs" },
      });
      expect(wrong.statusCode).toBe(400);
      expect(wrong.json().error).toContain("Magazin A");
      for (const [storeId, url] of [
        [a, "https://www.magazin-a.ro/p1"],
        [a, "https://shop.magazin-a.ro/p2"],
        [b, "https://magazin-b.ro/p"],
      ])
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/scans",
              payload: { storeId, url },
            })
          ).statusCode,
        ).toBe(202);
      for (let i = 0; i < 100; i++) {
        const all = [
          ...(await app.inject(`/api/stores/${a}/scans`)).json(),
          ...(await app.inject(`/api/stores/${b}/scans`)).json(),
        ];
        if (all.every((s: Scan) => s.state === "COMPLETED")) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      const scansA = (await app.inject(`/api/stores/${a}/scans`)).json();
      expect(scansA).toHaveLength(2);
      expect(scansA.every((s: Scan) => s.storeId === a)).toBe(true);
      expect((await app.inject(`/api/stores/${b}/scans`)).json()).toHaveLength(
        1,
      );
      const stores = (await app.inject("/api/stores")).json();
      expect(stores.find((s: { id: string }) => s.id === a).summary.pages).toBe(
        2,
      );
      expect(
        (await app.inject({ method: "DELETE", url: `/api/stores/${a}` }))
          .statusCode,
      ).toBe(204);
      expect((await app.inject(`/api/stores/${a}/scans`)).statusCode).toBe(404);
      expect((await app.inject("/api/stores")).json()).toHaveLength(1);
      expect((await app.inject(`/api/stores/${b}/scans`)).json()).toHaveLength(
        1,
      );
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("migrarea la magazine elimină verificările vechi, fără magazin", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sg-migrate-"));
    const legacy = new DatabaseSync(path.join(dir, "storeguard.sqlite"));
    legacy.exec(
      "CREATE TABLE migrations(name TEXT PRIMARY KEY); INSERT INTO migrations VALUES ('001-initial'); CREATE TABLE scans(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);",
    );
    legacy
      .prepare("INSERT INTO scans VALUES (?, ?)")
      .run("old", JSON.stringify({ id: "old", state: "COMPLETED" }));
    legacy.close();
    const db = await openDatabase(dir);
    try {
      expect(db.all()).toEqual([]);
      expect(db.get("old")).toBeNull();
      expect(db.stores()).toEqual([]);
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
