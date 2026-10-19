import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { redactUrl } from "../../contracts/src/index.js";
export class SecurityError extends Error {}
export function publicAddress(value: string): boolean {
  try {
    let address = ipaddr.parse(value.replace(/^\[|\]$/g, ""));
    if (
      address.kind() === "ipv6" &&
      (address as ipaddr.IPv6).isIPv4MappedAddress()
    )
      address = (address as ipaddr.IPv6).toIPv4Address();
    if (address.range() !== "unicast") return false;
    const denied =
      address.kind() === "ipv4"
        ? [
            "192.0.0.0/24",
            "192.0.2.0/24",
            "198.51.100.0/24",
            "203.0.113.0/24",
            "198.18.0.0/15",
          ]
        : [
            "::/96",
            "2001:10::/28",
            "2001:20::/28",
            "2001:db8::/32",
            "2001::/32",
            "2002::/16",
            "64:ff9b::/96",
            "64:ff9b:1::/48",
          ];
    return !denied.some((cidr) => {
      const [net, bits] = ipaddr.parseCIDR(cidr);
      return address.kind() === net.kind() && address.match(net, bits);
    });
  } catch {
    return false;
  }
}
export type Resolver = (
  host: string,
) => Promise<{ address: string; family: number }[]>;
export class NetworkPolicy {
  constructor(
    /** Test-only allowance for controlled local servers; never exposed through the API. */
    private readonly fixtureOrigin?: string | string[],
    private readonly resolver: Resolver = (host) =>
      lookup(host, { all: true, verbatim: true }),
  ) {}
  async resolve(
    value: string,
  ): Promise<{ url: URL; address: string; family: number }> {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new SecurityError(
        "Sunt permise doar adrese HTTP/HTTPS fără credențiale.",
      );
    const fixture =
      this.fixtureOrigin !== undefined &&
      [this.fixtureOrigin].flat().includes(url.origin);
    if (!fixture && url.port && url.port !== "80" && url.port !== "443")
      throw new SecurityError(
        "Sunt permise numai porturile HTTP/HTTPS standard.",
      );
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    let timer: ReturnType<typeof setTimeout>;
    const addresses = await Promise.race([
      isIP(hostname)
        ? Promise.resolve([{ address: hostname, family: isIP(hostname) }])
        : this.resolver(hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS_TIMEOUT")), 3000);
      }),
    ]).finally(() => clearTimeout(timer));
    if (
      !addresses.length ||
      (!fixture && addresses.some((a) => !publicAddress(a.address)))
    )
      throw new SecurityError(
        "Destinație locală, privată, rezervată sau metadata blocată.",
      );
    return { url, ...addresses[0] };
  }
}
export function safeCause(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const code = msg.match(
    /net::ERR_[A-Z_]+|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|DNS_TIMEOUT/,
  )?.[0];
  if (code) return code;
  if (/Timeout|timeout/i.test(msg)) return "NAVIGATION_TIMEOUT";
  if (
    /Executable doesn't exist|browserType.launch|Host system is missing/i.test(
      msg,
    )
  )
    return "BROWSER_UNAVAILABLE";
  return msg.replace(/https?:\/\/[^\s"']+/g, (m) => redactUrl(m)).slice(0, 220);
}
