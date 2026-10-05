import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// Fetches a public web page whose address came from data she typed (her website in the business
// profile), so the server never becomes a way into its own network: https only, every hop's
// host resolved and refused when it points at a loopback, private, link-local or metadata
// address, redirects followed by hand (at most MAX_REDIRECTS), and the body cut off at a byte cap.

export const MAX_REDIRECTS = 3;
export const MAX_BODY_BYTES = 1_500_000;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4] // reserved, broadcast
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["fd00:ec2::", 32] // AWS metadata over IPv6
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

const METADATA_HOSTS = new Set(["metadata", "metadata.google.internal", "instance-data"]);

export function isBlockedAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    // IPv4-mapped (::ffff:10.0.0.1) is checked as the IPv4 address it carries.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(address, "ipv6");
  }
  return true;
}

// Throws UnsafeUrlError unless the URL is https and every address its host resolves to is public.
export async function assertPublicUrl(url: URL) {
  if (url.protocol !== "https:") throw new UnsafeUrlError("Only https addresses are fetched.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || METADATA_HOSTS.has(host)) {
    throw new UnsafeUrlError(`Refused host ${host || "(none)"}.`);
  }
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isBlockedAddress)) {
    throw new UnsafeUrlError(`Refused host ${host}: it points at a private address.`);
  }
}

// Reads at most maxBytes of the body as UTF-8 text; the rest is never downloaded.
async function readCapped(res: Response, maxBytes: number) {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - bytes;
    const chunk = value.byteLength > room ? value.subarray(0, room) : value;
    bytes += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
    if (bytes >= maxBytes) {
      // At the cap: the rest, if any, is never read.
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return { text: text + decoder.decode(), truncated };
}

export async function fetchPublicText(
  input: string,
  opts: { timeoutMs?: number; maxBytes?: number; accept?: string } = {}
) {
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 8_000);
  let url = new URL(input);
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { Accept: opts.accept ?? "text/html" }
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new Error(`Redirect ${res.status} without a location`);
      if (hop >= MAX_REDIRECTS) throw new UnsafeUrlError("Too many redirects.");
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${res.status}`);
    }
    const { text, truncated } = await readCapped(res, opts.maxBytes ?? MAX_BODY_BYTES);
    return { url: url.href, text, truncated };
  }
}
