import Fastify from "fastify";
import { getDomain } from "tldts";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import {
  scanInputSchema,
  settingsSchema,
  storeInputSchema,
  belongsToDomain,
  redactUrl,
  type Scan,
  type Report,
  type Settings,
  type Store,
} from "../../../packages/contracts/src/index.js";
import {
  scanPage,
  ENGINE_VERSION,
} from "../../../packages/pdp-availability/src/scanner.js";
import { safeCause } from "../../../packages/pdp-availability/src/security.js";
import { openDatabase } from "./database.js";
import { ScanQueue } from "./queue.js";
export interface AppOptions {
  directory?: string;
  concurrency?: number;
  capacity?: number;
  scanner?: typeof scanPage;
}
export async function buildApp(options: AppOptions = {}) {
  const directory = path.resolve(options.directory ?? "data");
  const db = await openDatabase(directory);
  const queue = new ScanQueue(options.concurrency ?? 2, options.capacity ?? 20),
    scanner = options.scanner ?? scanPage;
  const app = Fastify({
    logger: false,
    bodyLimit: 16384,
    requestTimeout: 10000,
  });
  app.addHook("onRequest", async (req, reply) => {
    const host = req.headers.host?.split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host ?? ""))
      return reply.code(403).send({ error: "Host nepermis." });
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4310",
        "http://localhost:4310",
      ].includes(origin)
    )
      return reply.code(403).send({ error: "Origin nepermis." });
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "no-store");
  });
  app.get("/api/health", () => ({ ok: true, engine: ENGINE_VERSION }));
  /* ---------- Stores: every scan belongs to exactly one store ---------- */
  const active = (s: Scan) => s.state === "QUEUED" || s.state === "RUNNING";
  /** List payload: drops heavy evidence that only the full report needs. */
  const light = (scan: Scan): Scan =>
    scan.report
      ? {
          ...scan,
          report: {
            ...scan.report,
            observation: {
              ...scan.report.observation,
              samples: scan.report.observation.samples.slice(-1),
            },
            rules: scan.report.rules.map((r) => ({ ...r, technical: {} })),
            diagnostics: scan.report.diagnostics && {
              ...scan.report.diagnostics,
              waterfall: [],
              findings: scan.report.diagnostics.findings.map((f) => ({
                ...f,
                technical: {},
              })),
            },
          },
        }
      : scan;
  const storeSummary = (store: Store) => {
    const scans = db.byStore(store.id);
    const latest = new Map<string, Scan>();
    for (const scan of scans)
      if (!active(scan) && !latest.has(scan.url)) latest.set(scan.url, scan);
    let failing = 0,
      warning = 0;
    for (const scan of latest.values()) {
      const statuses = [
        ...(scan.report?.diagnostics?.features.map((f) => f.status) ?? []),
        scan.report?.verdict === "FAIL"
          ? "fail"
          : scan.report?.verdict === "WARNING"
            ? "warn"
            : "ok",
      ];
      if (statuses.includes("fail")) failing++;
      else if (statuses.includes("warn")) warning++;
    }
    return {
      ...store,
      summary: {
        pages: latest.size,
        scans: scans.length,
        running: scans.filter(active).length,
        lastScanAt: scans[0]?.createdAt ?? null,
        failing,
        warning,
      },
    };
  };
  app.get("/api/stores", () => db.stores().map(storeSummary));
  app.post("/api/stores", async (req, reply) => {
    const parsed = storeInputSchema.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: parsed.error.issues.map((i) => i.message).join(" ") });
    if (db.stores().some((s) => s.domain === parsed.data.domain))
      return reply
        .code(409)
        .send({ error: "Există deja un magazin cu acest domeniu." });
    const store: Store = {
      id: randomUUID(),
      ...parsed.data,
      createdAt: new Date().toISOString(),
    };
    db.putStore(store);
    return reply.code(201).send(storeSummary(store));
  });
  app.get<{ Params: { id: string } }>("/api/stores/:id", async (req, reply) => {
    const store = db.store(req.params.id);
    return store
      ? storeSummary(store)
      : reply.code(404).send({ error: "Magazinul nu există." });
  });
  app.delete<{ Params: { id: string } }>(
    "/api/stores/:id",
    async (req, reply) => {
      if (!db.store(req.params.id))
        return reply.code(404).send({ error: "Magazinul nu există." });
      if (db.byStore(req.params.id).some(active))
        return reply.code(409).send({
          error:
            "Așteaptă finalizarea verificărilor în curs înainte de ștergere.",
        });
      db.deleteStore(req.params.id);
      return reply.code(204).send();
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/stores/:id/scans",
    async (req, reply) =>
      db.store(req.params.id)
        ? db.byStore(req.params.id).map(light)
        : reply.code(404).send({ error: "Magazinul nu există." }),
  );
  app.get<{ Params: { id: string } }>(
    "/api/scans/:id",
    async (req, reply) =>
      db.get(req.params.id) ??
      reply.code(404).send({ error: "Scanarea nu există." }),
  );
  app.get("/api/settings", () => db.settings());
  const sanitizedSettings = (s: Settings): Settings => ({
    ...s,
    expectedUrl: s.expectedUrl ? redactUrl(s.expectedUrl) : "",
  });
  app.put("/api/settings", async (req, reply) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    const settings = sanitizedSettings(parsed.data);
    db.saveSettings(settings);
    return settings;
  });
  app.post("/api/scans", async (req, reply) => {
    const parsed = scanInputSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: parsed.error.issues.some((i) => i.path[0] === "storeId")
          ? "Alege magazinul pentru această verificare."
          : "Introdu un URL HTTP/HTTPS valid.",
      });
    const { url, expectedActive, storeId } = parsed.data;
    const store = db.store(storeId);
    if (!store) return reply.code(404).send({ error: "Magazinul nu există." });
    if (!belongsToDomain(url, store.domain))
      return reply.code(400).send({
        error: `Adresa nu aparține magazinului ${store.name} (${store.domain}).`,
      });
    const target = new URL(url);
    if (target.username || target.password)
      return reply
        .code(400)
        .send({ error: "Adresele cu credențiale nu sunt permise." });
    const scan: Scan = {
      id: randomUUID(),
      storeId,
      url: redactUrl(url),
      expectedActive,
      state: "QUEUED",
      createdAt: new Date().toISOString(),
      finishedAt: null,
      settings: db.settings(),
      report: null,
      error: null,
    };
    try {
      // Store before enqueue: even immediately starting jobs can always be retrieved.
      db.put(scan);
      queue.enqueue(
        getDomain(target.hostname, { allowPrivateDomains: true }) ??
          target.hostname,
        async () => {
          const previewFile = path.join(
            directory,
            "evidence",
            `${scan.id}-preview.jpg`,
          );
          let live: Scan = { ...scan, state: "RUNNING", phase: "PREPARING" };
          const update = (patch: Partial<Scan>) => {
            live = { ...live, ...patch };
            db.put(live);
          };
          db.put(live);
          try {
            const report: Report = await scanner(
              url,
              scan.settings,
              expectedActive,
              path.join(directory, "evidence", `${scan.id}.png`),
              undefined,
              {
                phase: (phase) => update({ phase }),
                previewFile,
                preview: () => update({ preview: true }),
              },
            );
            const state =
              report.observation.securityBlocked ||
              report.observation.environmentError ||
              report.observation.samples.at(-1)?.blocked
                ? "BLOCKED"
                : "COMPLETED";
            db.put({
              ...scan,
              state,
              report,
              phase: null,
              preview: false,
              finishedAt: new Date().toISOString(),
            });
          } catch (error) {
            db.put({
              ...scan,
              state: "FAILED",
              phase: null,
              preview: false,
              finishedAt: new Date().toISOString(),
              error: safeCause(error),
            });
          } finally {
            // The live preview only serves the progress view; it is not kept as evidence.
            await rm(previewFile, { force: true }).catch(() => {});
          }
        },
      );
    } catch (error) {
      db.put({
        ...scan,
        state: "FAILED",
        finishedAt: new Date().toISOString(),
        error: safeCause(error),
      });
      return reply.code(429).send({ error: safeCause(error) });
    }
    return reply.code(202).send(scan);
  });
  app.get<{ Params: { id: string } }>(
    "/api/scans/:id/preview",
    async (req, reply) => {
      if (
        !/^[0-9a-f-]{36}$/.test(req.params.id) ||
        !db.get(req.params.id)?.preview
      )
        return reply.code(404).send({ error: "Previzualizare indisponibilă." });
      try {
        return reply
          .type("image/jpeg")
          .send(
            await readFile(
              path.join(directory, "evidence", `${req.params.id}-preview.jpg`),
            ),
          );
      } catch {
        return reply.code(404).send({ error: "Previzualizare indisponibilă." });
      }
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/scans/:id/screenshot",
    async (req, reply) => {
      if (
        !/^[0-9a-f-]{36}$/.test(req.params.id) ||
        !db.get(req.params.id)?.report?.observation.screenshot
      )
        return reply.code(404).send({ error: "Captură indisponibilă." });
      try {
        return reply
          .type("image/png")
          .send(
            await readFile(
              path.join(directory, "evidence", `${req.params.id}.png`),
            ),
          );
      } catch {
        return reply.code(404).send({ error: "Captura nu este disponibilă." });
      }
    },
  );
  app.setErrorHandler((error, req, reply) =>
    reply.code(500).send({
      error: "Eroare internă a aplicației. Verifică configurația locală.",
    }),
  );
  app.addHook("onClose", async () => {
    await queue.close();
    db.close();
  });
  return app;
}
