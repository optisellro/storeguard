import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

describe("Runtime aplicație (node --import tsx)", () => {
  it("scannerul analizează pagina când rulează ca în aplicație", async () => {
    const { stdout } = await run(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/scan-cli.ts"],
      { timeout: 25000, env: process.env },
    );
    const result = JSON.parse(stdout) as {
      samples: number;
      statuses: string[];
    };
    expect(result.samples).toBeGreaterThan(0);
    expect(result.statuses).toEqual(Array(7).fill("PASS"));
  });
});
