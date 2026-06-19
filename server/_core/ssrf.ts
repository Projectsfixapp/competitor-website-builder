/**
 * SSRF guard for server-side fetches of user-supplied URLs (competitor scraping,
 * future image fetching). Validates protocol/port, resolves DNS, blocks
 * private/reserved/loopback/link-local ranges (incl. cloud metadata
 * 169.254.169.254), and re-validates every redirect hop instead of trusting
 * fetch's automatic redirect handling.
 *
 * Known residual risk: DNS-rebinding (TOCTOU between the lookup() here and the
 * fetch() a moment later) is not closed — that needs pinning the resolved IP
 * via a custom connect/dispatcher, which is a larger change. Out of scope for
 * this pass; everything else (the exploitable case flagged in review — raw
 * fetch(url) with zero IP filtering) is closed.
 */

import dns from "node:dns/promises";
import net from "node:net";

export class SsrfBlockedError extends Error {}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_PORTS = new Set(["", "80", "443"]);
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

const IPV4_BLOCKED_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // shared/CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — covers cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmark
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isIpv4InRange(ip: string, range: string, bits: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  return IPV4_BLOCKED_RANGES.some(([range, bits]) => isIpv4InRange(ip, range, bits));
}

/** Parses any textual IPv6 form (incl. "::" compression and embedded IPv4) into a 128-bit BigInt. */
function ipv6ToBigInt(ip: string): bigint {
  let address = ip;
  const ipv4Embedded = /(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (ipv4Embedded) {
    const v4Int = ipv4ToInt(ipv4Embedded[1]!);
    const hex = v4Int.toString(16).padStart(8, "0");
    address = address.slice(0, address.length - ipv4Embedded[1]!.length) + `${hex.slice(0, 4)}:${hex.slice(4)}`;
  }
  const sides = address.split("::");
  const head = sides[0] ? sides[0].split(":").filter(Boolean) : [];
  const tail = sides.length > 1 && sides[1] ? sides[1].split(":").filter(Boolean) : [];
  const missing = Math.max(8 - head.length - tail.length, 0);
  const groups = [...head, ...Array(missing).fill("0"), ...tail].slice(0, 8);
  let result = BigInt(0);
  for (const g of groups) {
    result = (result << BigInt(16)) | BigInt(parseInt(g || "0", 16));
  }
  return result;
}

function isIpv6InRange(ipBig: bigint, prefixHex: string, prefixBits: number): boolean {
  const prefixBig = ipv6ToBigInt(prefixHex);
  const shift = BigInt(128 - prefixBits);
  return (ipBig >> shift) === (prefixBig >> shift);
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const big = ipv6ToBigInt(ip);
  if (big === BigInt(0)) return true; // ::
  if (big === BigInt(1)) return true; // ::1 loopback
  if (isIpv6InRange(big, "fc00::", 7)) return true; // unique local
  if (isIpv6InRange(big, "fe80::", 10)) return true; // link-local
  if (isIpv6InRange(big, "ff00::", 8)) return true; // multicast
  if (isIpv6InRange(big, "::ffff:0:0", 96)) {
    // IPv4-mapped — extract and re-check the embedded IPv4 address
    const v4Int = Number(big & BigInt(0xffffffff));
    const v4 = [
      (v4Int >>> 24) & 0xff,
      (v4Int >>> 16) & 0xff,
      (v4Int >>> 8) & 0xff,
      v4Int & 0xff,
    ].join(".");
    return isPrivateOrReservedIpv4(v4);
  }
  return false;
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export function validateUrlShape(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`Ungültige URL: ${rawUrl}`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SsrfBlockedError(`Protokoll nicht erlaubt: ${parsed.protocol}`);
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new SsrfBlockedError(`Port nicht erlaubt: ${parsed.port}`);
  }
  return parsed;
}

export async function assertSafeHost(hostname: string): Promise<void> {
  const host = stripBrackets(hostname).toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") {
    throw new SsrfBlockedError(`Host nicht erlaubt: ${hostname}`);
  }

  const records = await dns.lookup(host, { all: true });
  if (records.length === 0) {
    throw new SsrfBlockedError(`Konnte Host nicht auflösen: ${hostname}`);
  }
  for (const { address, family } of records) {
    if (family === 4 && isPrivateOrReservedIpv4(address)) {
      throw new SsrfBlockedError(`Host zeigt auf nicht erlaubte IP-Adresse: ${address}`);
    }
    if (family === 6 && isPrivateOrReservedIpv6(address)) {
      throw new SsrfBlockedError(`Host zeigt auf nicht erlaubte IPv6-Adresse: ${address}`);
    }
    if (family !== 4 && family !== 6 && !net.isIP(address)) {
      throw new SsrfBlockedError(`Unerwartete Adressfamilie für Host: ${hostname}`);
    }
  }
}

/**
 * SSRF-safe fetch: validates protocol/port + resolved IP before every request,
 * and re-validates on every redirect hop (redirects are followed manually so a
 * 302 can't be used to reach a target that would fail validation directly).
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = validateUrlShape(currentUrl);
    await assertSafeHost(parsed.hostname);

    const response = await fetch(parsed.toString(), { ...init, redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SsrfBlockedError("Redirect-Antwort ohne Location-Header.");
      }
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    return response;
  }
  throw new SsrfBlockedError(`Zu viele Redirects (Limit: ${MAX_REDIRECTS}).`);
}

/** Like safeFetch, but reads the body as text with a hard byte cap to prevent memory exhaustion. */
export async function safeFetchText(rawUrl: string, init: RequestInit = {}): Promise<string> {
  const response = await safeFetch(rawUrl, init);
  const reader = response.body?.getReader();
  if (!reader) {
    return await response.text();
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new SsrfBlockedError(`Antwort überschreitet Limit von ${MAX_RESPONSE_BYTES} Bytes.`);
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}
