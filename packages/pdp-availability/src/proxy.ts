import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { NetworkPolicy, SecurityError, safeCause } from "./security.js";
/** Every upstream connection uses the IP validated by our resolver, never a second browser DNS lookup. */
export async function createEgressProxy(
  policy: NetworkPolicy,
  onBlocked: (url?: string, isDocument?: boolean) => void,
  onFailure: (url: string, cause: string) => void = () => {},
) {
  const sockets = new Set<Duplex>();
  const server = http.createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method ?? "")) {
        onBlocked(req.url, req.headers["sec-fetch-dest"] === "document");
        res.writeHead(403, { "x-storeguard-proxy-error": "blocked" }).end();
        return;
      }
      const target = await policy.resolve(req.url ?? "");
      if (target.url.protocol !== "http:")
        throw new Error("Protocol HTTP invalid");
      if (res.destroyed) return;
      const headers: http.OutgoingHttpHeaders = {
        ...req.headers,
        host: target.url.host,
      };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      const upstream = http.request(
        {
          host: target.address,
          family: target.family,
          port: target.url.port || 80,
          method: req.method,
          path: target.url.pathname + target.url.search,
          headers,
          timeout: 60000,
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("socket", (socket) => {
        if (!sockets.has(socket)) {
          sockets.add(socket);
          socket.once("close", () => sockets.delete(socket));
        }
      });
      upstream.on("error", (error: NodeJS.ErrnoException) => {
        onFailure(target.url.href, error.code ?? "CONNECTION_ERROR");
        if (!res.headersSent)
          res.writeHead(502, { "x-storeguard-proxy-error": "1" });
        res.end();
      });
      upstream.on("timeout", () => upstream.destroy());
      req.on("aborted", () => upstream.destroy());
      req.pipe(upstream);
    } catch (error) {
      if (error instanceof SecurityError) {
        onBlocked(req.url, req.headers["sec-fetch-dest"] === "document");
        res.writeHead(403, { "x-storeguard-proxy-error": "blocked" }).end();
      } else {
        onFailure(req.url ?? "", safeCause(error));
        res.writeHead(502, { "x-storeguard-proxy-error": "1" }).end();
      }
    }
  });
  server.on("connect", async (req, client, head) => {
    try {
      const target = await policy.resolve(`https://${req.url}/`);
      if (client.destroyed) return;
      const upstream = net.connect({
        host: target.address,
        family: target.family,
        port: Number(target.url.port || 443),
      });
      sockets.add(upstream);
      upstream.on("close", () => sockets.delete(upstream));
      upstream.setTimeout(60000, () => upstream.destroy());
      upstream.on("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on("error", (error: NodeJS.ErrnoException) => {
        onFailure(target.url.href, error.code ?? "CONNECTION_ERROR");
        client.destroy();
      });
      client.on("error", () => upstream.destroy());
      client.on("close", () => upstream.destroy());
    } catch (error) {
      if (error instanceof SecurityError)
        onBlocked(`https://${req.url}/`, false);
      else onFailure(`https://${req.url}/`, safeCause(error));
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as net.AddressInfo;
  return {
    server: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
