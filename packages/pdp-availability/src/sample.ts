import type { Page } from "playwright";
import type { Sample, Settings } from "../../contracts/src/index.js";
/**
 * Builds a self-contained script for page.evaluate. The app runs through tsx, whose
 * keepNames transform wraps nested functions in `__name(...)`; that helper does not exist
 * in the page, so a serialized function would throw on every sample. The shim is local to
 * the script scope and does not touch the page's globals.
 */
export function pageScript<A>(fn: (args: A) => unknown, args: A): string {
  return `(() => { const __name = (target) => target; return (${fn.toString()}); })()(${JSON.stringify(args)})`;
}
export async function sample(
  page: Page,
  settings: Settings,
  atMs: number,
): Promise<Sample> {
  return (await page.evaluate(
    pageScript(collect, { settings, atMs }),
  )) as Sample;
}
function collect({
  settings,
  atMs,
}: {
  settings: Settings;
  atMs: number;
}): Sample {
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return (
      r.width > 1 &&
      r.height > 1 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth &&
      s.display !== "none" &&
      s.visibility === "visible" &&
      Number(s.opacity) > 0 &&
      el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    );
  };
  const matches = (selector: string) =>
    selector ? [...document.querySelectorAll(selector)].some(visible) : false;
  const all = [...document.querySelectorAll("body *")]
    .slice(0, 15000)
    .filter(visible);
  const textElements = all.filter(
    (el) =>
      !["SCRIPT", "STYLE", "NOSCRIPT", "SVG"].includes(el.tagName) &&
      [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim(),
      ),
  );
  const text = textElements
    .map((el) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join(" ")
        .trim(),
    )
    .join(" ")
    .replace(/\s+/g, " ");
  const media = all.filter(
    (el) =>
      (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 10) ||
      (el instanceof HTMLVideoElement && el.readyState >= 2),
  );
  const leaf = all.filter(
    (el) =>
      el.children.length === 0 &&
      (el.textContent?.trim() ||
        ["INPUT", "BUTTON", "HR"].includes(el.tagName) ||
        (getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)" &&
          getComputedStyle(el).backgroundColor !== "rgb(255, 255, 255)")),
  );
  const main =
    document.querySelector('main, [role="main"], [itemtype*="Product"]') ??
    document.body;
  const mainText =
    (main as HTMLElement)?.innerText?.replace(/\s+/g, " ").trim() ?? "";
  const heading = [...main.querySelectorAll("h1")].find(visible);
  const productSignal =
    !!heading &&
    mainText.length > 40 &&
    (media.length > 0 ||
      /(?:\d[.,]\d{2}\s*(?:lei|ron|eur|€|\$)|(?:lei|ron|eur)\s*\d)/i.test(
        mainText,
      ) ||
      !!main.querySelector('[itemprop="price"], [itemtype*="Product"]'));
  const contextual = [
    ...document.querySelectorAll('h1,h2,[role="alert"], main > p'),
  ]
    .filter(visible)
    .map((el) => el.textContent?.trim() ?? "");
  const defaultMessages = [
    "something went wrong",
    "internal server error",
    "an error occurred",
    "service unavailable",
    "a apărut o eroare",
    "a aparut o eroare",
    "pagina nu a fost găsită",
    "page not found",
  ];
  const messageMatch =
    contextual.some((t) =>
      [...defaultMessages, ...settings.errorMessages].some((m) =>
        t.toLowerCase().includes(m.toLowerCase()),
      ),
    ) ||
    settings.errorMessages.some(
      (m) =>
        !productSignal &&
        mainText.length < 1200 &&
        mainText.toLowerCase().includes(m.toLowerCase()),
    );
  const errorSelector = matches(settings.errorSelector);
  const normalized = (
    contextual.join(" ") +
    " " +
    (mainText.length < 2000 ? mainText : "")
  ).toLowerCase();
  let blocked: string | null = null;
  if (
    /verify you are human|checking your browser|just a moment|attention required|verifică dacă ești|verifica daca esti/.test(
      normalized,
    ) ||
    matches(
      'iframe[src*="captcha"], [id="captcha"], [class="g-recaptcha"], #challenge-running',
    )
  )
    blocked = "CAPTCHA / protecție anti-bot";
  else if (
    /access denied|forbidden|acces interzis/.test(normalized) &&
    !productSignal
  )
    blocked = "Acces restricționat";
  else if (matches('input[type="password"]') && !productSignal)
    blocked = "Autentificare necesară";
  const loader = matches(settings.loaderSelector);
  const loaderBlocking =
    !!settings.loaderSelector &&
    [...document.querySelectorAll(settings.loaderSelector)]
      .filter(visible)
      .some((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width * r.height >= innerWidth * innerHeight * 0.6 &&
          getComputedStyle(el).pointerEvents !== "none"
        );
      });
  const genericLoader = matches(
    '[role="progressbar"], [aria-busy="true"], .spinner, .loading-spinner',
  );
  const cookieBanner = matches(
    '[id*="cookie"], [class*="cookie-banner"], [aria-label*="cookie" i]',
  );
  const contentArea = leaf.concat(media).reduce((sum, el) => {
    const r = el.getBoundingClientRect();
    return (
      sum + Math.min(r.width, innerWidth) * Math.min(r.height, innerHeight)
    );
  }, 0);
  const complexVisual =
    matches("canvas,iframe,svg") ||
    all.some((el) => getComputedStyle(el).backgroundImage.startsWith("url(")) ||
    all.length >= 15000;
  return {
    atMs,
    readyState: document.readyState,
    textChars: text.length,
    visibleElements: leaf.length,
    mediaElements: media.length,
    contentArea,
    loader,
    loaderBlocking,
    genericLoader,
    productSignal,
    cookieBanner,
    softError: (errorSelector || messageMatch) && !productSignal,
    blocked,
    complexVisual,
    signature: `${text.length}:${leaf.length}:${media.length}:${Math.round(contentArea / 1000)}:${productSignal}`,
  };
}
