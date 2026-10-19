// Runs the real scanner under the same TypeScript loader as the app (`node --import tsx`).
// tsx compiles with keepNames, which injects `__name(...)` helpers into functions passed to
// page.evaluate; this script guards against that class of runtime-only failure.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fixtureServer } from "./server.js";
import { NetworkPolicy } from "../../packages/pdp-availability/src/security.js";
import { scanPage } from "../../packages/pdp-availability/src/scanner.js";
import { defaults } from "../../packages/contracts/src/index.js";

const fixture = await fixtureServer();
const dir = await mkdtemp(path.join(os.tmpdir(), "storeguard-cli-"));
try {
  const report = await scanPage(
    fixture.origin + "/normal",
    {
      ...defaults,
      navigationTimeoutMs: 5000,
      renderTimeoutMs: 3000,
      globalTimeoutMs: 15000,
    },
    false,
    path.join(dir, "capture.png"),
    new NetworkPolicy(fixture.origin),
  );
  process.stdout.write(
    JSON.stringify({
      samples: report.observation.samples.length,
      statuses: report.rules.map((r) => r.status),
    }),
  );
} finally {
  await fixture.close();
  await rm(dir, { recursive: true, force: true });
}
