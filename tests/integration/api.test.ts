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
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/scans",
            payload: { url: "file:///etc/passwd" },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/scans",
            payload: { url: "https://user:secret@example.com" },
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
            url: "/api/scans",
            headers: { host: "evil.example" },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: "/api/scans",
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
      const response = await app.inject({
        method: "POST",
        url: "/api/scans",
        payload: { url: "http://127.0.0.1/private?token=secret" },
      });
      expect(response.statusCode).toBe(202);
      const id = response.json().id;
      await app.close();
      app = await buildApp({ directory: dir });
      const scan = (await app.inject(`/api/scans/${id}`)).json();
      expect(scan.state).toBe("BLOCKED");
      expect(scan.url).not.toContain("secret");
      expect(scan.report.verdict).toBe("INCONCLUSIVE");
      expect((await app.inject("/api/scans")).json()).toHaveLength(1);
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
      const response = await app.inject({
        method: "POST",
        url: "/api/scans",
        payload: { url: fixture.origin + "/blank" },
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
      const id = (
        await app.inject({
          method: "POST",
          url: "/api/scans",
          payload: { url: "https://example.com/produs" },
        })
      ).json().id;
      for (let i = 0; i < 50 && !previewPath; i++)
        await new Promise((r) => setTimeout(r, 10));
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
      await expect(stat(previewPath)).rejects.toThrow();
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("recuperează RUNNING / QUEUED ca FAILED, fără retry automat", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sg-recover-"));
    let db = await openDatabase(dir);
    const scan: Scan = {
      id: "interrupted",
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
});
