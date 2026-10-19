import { describe, it, expect } from "vitest";
import {
  publicAddress,
  NetworkPolicy,
} from "../packages/pdp-availability/src/security.js";
import { createEgressProxy } from "../packages/pdp-availability/src/proxy.js";
import http from "node:http";
describe("protecție rețea", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.31.2.3",
    "192.168.1.1",
    "169.254.169.254",
    "100.100.100.200",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fc00::1",
    "224.0.0.1",
    "2001:db8::1",
    "2002:7f00:1::",
    "64:ff9b::7f00:1",
    "192.0.2.1",
  ])("blochează %s", (address) => expect(publicAddress(address)).toBe(false));
  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "acceptă %s",
    (address) => expect(publicAddress(address)).toBe(true),
  );
  it("blochează DNS mixt și rebinding la reevaluare", async () => {
    let count = 0;
    const p = new NetworkPolicy(undefined, async () => [
      { address: ++count === 1 ? "1.1.1.1" : "127.0.0.1", family: 4 },
    ]);
    await p.resolve("https://shop.example");
    await expect(p.resolve("https://shop.example")).rejects.toThrow("blocată");
    const mixed = new NetworkPolicy(undefined, async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(mixed.resolve("https://shop.example")).rejects.toThrow();
  });
  it("respinge scheme, credențiale și porturi arbitrare", async () => {
    const p = new NetworkPolicy();
    for (const url of [
      "file:///etc/passwd",
      "data:text/plain,hello",
      "http://user:secret@1.1.1.1",
      "http://1.1.1.1:8080",
    ])
      await expect(p.resolve(url)).rejects.toThrow();
  });
  it("proxy refuză metadata fără a iniția conexiunea", async () => {
    const proxy = await createEgressProxy(new NetworkPolicy(), () => {});
    try {
      const status = await new Promise((resolve) =>
        http.get(
          proxy.server,
          { path: "http://169.254.169.254/latest/meta-data/" },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        ),
      );
      expect(status).toBe(403);
    } finally {
      await proxy.close();
    }
  });
});
