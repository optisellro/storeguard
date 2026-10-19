/**
 * In-page instrumentation, installed before any page script runs.
 * Written as plain JavaScript strings (not serialized TypeScript functions) so the
 * runtime loader cannot inject helpers that do not exist in the page.
 * Buffers are bounded; only short, truncated texts are kept.
 */
export const INSTRUMENT_SCRIPT = `(() => {
  if (window.__sg) return;
  var sg = { rejections: [], csp: [], longTasks: [], lcp: null, lcpTag: null, fcp: null, cls: 0, swRegistrations: 0 };
  Object.defineProperty(window, "__sg", { value: sg, enumerable: false });
  var cut = function (v, n) { try { return String(v == null ? "" : v).slice(0, n); } catch (e) { return ""; } };
  addEventListener("unhandledrejection", function (e) {
    if (sg.rejections.length >= 50) return;
    var r = e.reason;
    sg.rejections.push({
      t: performance.now(),
      name: r && r.name ? cut(r.name, 80) : null,
      message: cut(r && r.message ? r.message : r, 300),
      stack: r && r.stack ? cut(r.stack, 600) : null
    });
  });
  document.addEventListener("securitypolicyviolation", function (e) {
    if (sg.csp.length >= 50) return;
    sg.csp.push({ t: performance.now(), directive: cut(e.effectiveDirective || e.violatedDirective, 80), blocked: cut(e.blockedURI, 300), source: cut(e.sourceFile, 300) });
  });
  var observe = function (type, cb) {
    try { new PerformanceObserver(function (list) { list.getEntries().forEach(cb); }).observe({ type: type, buffered: true }); } catch (e) {}
  };
  observe("largest-contentful-paint", function (e) {
    sg.lcp = e.renderTime || e.loadTime || e.startTime;
    sg.lcpTag = e.element ? e.element.tagName.toLowerCase() : null;
  });
  observe("paint", function (e) { if (e.name === "first-contentful-paint") sg.fcp = e.startTime; });
  var win = 0, first = 0, last = 0;
  observe("layout-shift", function (e) {
    if (e.hadRecentInput) return;
    if (win > 0 && e.startTime - last < 1000 && e.startTime - first < 5000) win += e.value;
    else { win = e.value; first = e.startTime; }
    last = e.startTime;
    if (win > sg.cls) sg.cls = win;
  });
  observe("longtask", function (e) {
    if (sg.longTasks.length >= 200) return;
    var a = e.attribution && e.attribution[0];
    sg.longTasks.push({ t: e.startTime, d: e.duration, src: a ? cut(a.containerSrc || a.containerName || "", 300) || null : null });
  });
  try {
    var sw = navigator.serviceWorker;
    if (sw && sw.register) {
      var original = sw.register.bind(sw);
      sw.register = function () { sg.swRegistrations++; return original.apply(null, arguments); };
    }
  } catch (e) {}
})();`;

/** Reads the instrumentation buffers and navigation/resource timing from the main frame. */
export const READ_SCRIPT = `(() => {
  var sg = window.__sg || null;
  var nav = performance.getEntriesByType("navigation")[0];
  var blocking = performance.getEntriesByType("resource")
    .filter(function (r) { return r.renderBlockingStatus === "blocking"; })
    .slice(0, 100)
    .map(function (r) { return r.name; });
  return {
    instrumented: !!sg,
    rejections: sg ? sg.rejections : [],
    csp: sg ? sg.csp : [],
    longTasks: sg ? sg.longTasks : [],
    lcp: sg ? sg.lcp : null,
    lcpTag: sg ? sg.lcpTag : null,
    fcp: sg ? sg.fcp : null,
    cls: sg ? sg.cls : null,
    swRegistrations: sg ? sg.swRegistrations : 0,
    nav: nav ? {
      ttfb: nav.responseStart > 0 ? nav.responseStart : null,
      dcl: nav.domContentLoadedEventEnd > 0 ? nav.domContentLoadedEventEnd : null,
      load: nav.loadEventEnd > 0 ? nav.loadEventEnd : null
    } : null,
    blocking: blocking
  };
})()`;

export interface PageBuffers {
  instrumented: boolean;
  rejections: {
    t: number;
    name: string | null;
    message: string;
    stack: string | null;
  }[];
  csp: { t: number; directive: string; blocked: string; source: string }[];
  longTasks: { t: number; d: number; src: string | null }[];
  lcp: number | null;
  lcpTag: string | null;
  fcp: number | null;
  cls: number | null;
  swRegistrations: number;
  nav: { ttfb: number | null; dcl: number | null; load: number | null } | null;
  blocking: string[];
}
