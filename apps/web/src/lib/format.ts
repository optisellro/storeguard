export const dateTime = (value: string) =>
  new Date(value).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const relative = (value: string, now = Date.now()) => {
  const seconds = Math.max(0, Math.round((now - Date.parse(value)) / 1000));
  if (seconds < 45) return "acum câteva secunde";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return minutes === 1 ? "acum 1 minut" : `acum ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "acum 1 oră" : `acum ${hours} ore`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ieri" : `acum ${days} zile`;
};

export const seconds = (ms: number | null | undefined) =>
  ms === null || ms === undefined
    ? "—"
    : `${(ms / 1000).toLocaleString("ro-RO", {
        minimumFractionDigits: ms < 10000 ? 1 : 0,
        maximumFractionDigits: ms < 10000 ? 1 : 0,
      })} s`;

export function splitUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname.replace(/^www\./, ""),
      path: parsed.pathname === "/" ? "/" : parsed.pathname,
    };
  } catch {
    return { host: url, path: "" };
  }
}

/** Romanian plural: "1 pagină", "3 pagini", "20 de pagini". */
export const plural = (n: number, one: string, many: string) => {
  if (n === 1) return `1 ${one}`;
  const rest = n % 100;
  return `${n} ${n !== 0 && (rest === 0 || rest >= 20) ? "de " : ""}${many}`;
};
