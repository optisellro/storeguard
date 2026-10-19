import Fastify from "fastify";
import { getDomain } from "tldts";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import {
  scanInputSchema,
  settingsSchema,
  redactUrl,
  type Scan,
  type Report,
  type Settings,
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
  app.get("/api/scans", () => db.all());
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
      return reply
        .code(400)
        .send({ error: "Introdu un URL HTTP/HTTPS valid." });
    const { url, expectedActive } = parsed.data;
    const target = new URL(url);
    if (target.username || target.password)
      return reply
        .code(400)
        .send({ error: "Adresele cu credențiale nu sunt permise." });
    const scan: Scan = {
      id: randomUUID(),
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
