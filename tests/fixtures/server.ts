import http from "node:http";
import type { AddressInfo } from "node:net";
export const product = `<main><h1>Scaun ergonomic de birou</h1><p>Scaun cu suport lombar, reglabil pe înălțime. Disponibil pentru livrare din depozit.</p><strong>499,00 lei</strong><button>Adaugă în coș</button></main>`;
export async function fixtureServer() {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    const route = new URL(req.url ?? "/", "http://fixture").pathname;
    hits.push(route);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const html = (body: string) =>
      res.end(
        `<!doctype html><html><head><title>Fixture</title></head><body>${body}</body></html>`,
      );
    if (route === "/normal") return html(product);
    if (
      route === "/500" ||
      route === "/503" ||
      route === "/404" ||
      route === "/410"
    ) {
      res.statusCode = Number(route.slice(1));
      return html("<h1>Indisponibil</h1>");
    }
    if (route === "/blank") return html("");
    if (route === "/hidden")
      return html('<main style="display:none">' + product + "</main>");
    if (route === "/loader")
      return html(
        '<div class="product-loader" role="progressbar">Se încarcă…</div>',
      );
    if (route === "/overlay")
      return html(
        product +
          '<div class="product-loader" style="position:fixed;inset:0;background:white;z-index:1000">Se încarcă…</div>',
      );
    if (route === "/spinner-product")
      return html(product + '<span class="spinner">Actualizare stoc</span>');
    if (route === "/soft")
      return html(
        '<main><h1 class="fatal-error">Serviciu temporar indisponibil</h1></main>',
      );
    if (route === "/error-word")
      return html(
        product + "<footer>Cod error diagnostic în documentație</footer>",
      );
    if (route === "/cookie")
      return html(
        product +
          '<div class="cookie-banner">Folosim cookies <button>Acceptă</button></div>',
      );
    if (route === "/captcha")
      return html(
        '<main><h1>Verify you are human</h1><div id="captcha">Checking your browser</div></main>',
      );
    if (route === "/auth")
      return html(
        '<main><h1>Autentificare</h1><input type="password"/></main>',
      );
    if (route === "/forbidden") {
      res.statusCode = 403;
      return html("<h1>Access denied</h1>");
    }
    if (route === "/delay" || route === "/polling") {
      return html(
        `<div id="app"></div><script>setTimeout(()=>document.querySelector('#app').innerHTML=${JSON.stringify(product)},${route === "/delay" ? 700 : 0});${route === "/polling" ? "setInterval(()=>fetch('/ping'),80)" : ""}</script>`,
      );
    }
    if (route === "/hang") {
      return;
    }
    if (route === "/redirect") {
      res.writeHead(302, { location: "/normal" });
      return res.end();
    }
    if (route === "/redirect-error") {
      res.writeHead(302, { location: "/500" });
      return res.end();
    }
    if (route === "/loop") {
      res.writeHead(302, { location: "/loop2" });
      return res.end();
    }
    if (route === "/loop2") {
      res.writeHead(302, { location: "/loop" });
      return res.end();
    }
    if (route === "/private") {
      res.writeHead(302, {
        location: "http://169.254.169.254/latest/meta-data/",
      });
      return res.end();
    }
    if (route === "/secondary")
      return html(
        product +
          `<img src="http://169.254.169.254/latest/meta-data/"/><script>fetch('/submit',{method:'POST'});</script>`,
      );
    if (route === "/ping") {
      res.setHeader("Content-Type", "application/json");
      return res.end("{}");
    }
    /* Technical diagnostics fixtures: each page contains exactly one known defect. */
    const withScript = (js: string) => html(product + `<script>${js}</script>`);
    if (route === "/js-error")
      return withScript(
        "addEventListener('load',()=>{const product=undefined;product.price.toFixed(2);})",
      );
    if (route === "/rejection")
      return withScript("Promise.reject(new Error('Stoc indisponibil'))");
    if (route === "/console-error")
      return withScript("console.error('Widget recenzii: configurare lipsă')");
    if (route === "/api-fail")
      return withScript("fetch('/api/stock').catch(()=>{})");
    if (route === "/bad-json")
      return withScript("fetch('/api/data').then((r)=>r.text())");
    if (route === "/missing-assets")
      return html(
        '<link rel="stylesheet" href="/missing.css">' +
          product +
          '<script src="/missing.js"></script>',
      );
    if (route === "/long-task")
      return withScript(
        "setTimeout(()=>{const end=performance.now()+700;while(performance.now()<end){}},50)",
      );
    if (route === "/storm")
      return withScript(
        "let n=0;const next=()=>{if(n++<40)fetch('/ping?i='+n).finally(next)};next()",
      );
    if (route === "/hydration")
      return withScript(
        "console.error('Hydration failed because the initial UI does not match what was rendered on the server.')",
      );
    if (route === "/csp") {
      res.setHeader("Content-Security-Policy", "script-src 'none'");
      return withScript("document.title='inline'");
    }
    if (route === "/api/stock") {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      return res.end('{"error":"unavailable"}');
    }
    if (route === "/api/data") {
      res.setHeader("Content-Type", "application/json");
      return res.end('{"price": 12,');
    }
    if (route.startsWith("/missing")) {
      res.statusCode = 404;
      return res.end("not found");
    }
    return html(product);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
