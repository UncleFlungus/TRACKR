// Title lookup for the link field.
//
// The browser can't read a third-party page itself, so this endpoint does it
// and hands back the title. That makes it a request forwarder, which is the
// classic SSRF shape: with no guards, anyone could point it at
// 169.254.169.254 or an internal host and read the answer out of the title.
// Everything below exists to stop that.
//
// Deliberately unauthenticated. Trackr works signed out, and a link title is no
// more of a cloud feature than the rest of a local tracker, so gating this would
// mean previews that stop working for the people using the app the way it was
// meant to be used. The guards below are what make that safe; the cost of a
// stranger calling it is bandwidth, which a platform spend limit caps.
//
// Needs the Node runtime for node:dns, which is the default for files in api/.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { normalizeUrl } from '../src/core/url';

const FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 128 * 1024;
const MAX_TITLE_LENGTH = 200;

// Some sites serve a stub to unknown agents. Identifying the bot honestly gets
// better results than pretending to be a browser, and gives anyone reading
// their logs something to block.
const USER_AGENT = 'trackr-link-preview/1.0 (+https://github.com/jjhhkimm)';

/**
 * IPv4 ranges that must never be fetched: loopback, the private ranges, CGNAT,
 * link-local (which is where cloud metadata services live), the documentation
 * and benchmark blocks, multicast and the reserved top end.
 */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

/** The IPv6 equivalents: unspecified, loopback, unique-local, link-local, NAT64, multicast. */
const BLOCKED_V6: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['64:ff9b::', 96],
  ['ff00::', 8],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    out = out * 256 + value;
  }
  return out >>> 0;
}

function ipv6ToBigInt(ip: string): bigint | null {
  let text = ip.split('%')[0]; // drop any zone id

  // A trailing dotted quad means an IPv4-mapped or embedded address. Rewrite it
  // as two hex groups so the rest of the parse only has one shape to handle.
  const embedded = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) {
    const value = ipv4ToInt(embedded[1]);
    if (value === null) return null;
    const high = ((value >>> 16) & 0xffff).toString(16);
    const low = (value & 0xffff).toString(16);
    text = `${text.slice(0, embedded.index)}${high}:${low}`;
  }

  const [head, tail] = text.split('::');
  if (text.split('::').length > 2) return null;

  const headGroups = head ? head.split(':').filter(Boolean) : [];
  const tailGroups = tail ? tail.split(':').filter(Boolean) : [];

  let groups: string[];
  if (tail === undefined) {
    groups = headGroups;
  } else {
    const fill = 8 - headGroups.length - tailGroups.length;
    if (fill < 0) return null;
    groups = [...headGroups, ...Array<string>(fill).fill('0'), ...tailGroups];
  }
  if (groups.length !== 8) return null;

  let out = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    out = (out << 16n) | BigInt(parseInt(group, 16));
  }
  return out;
}

/** Fails closed: anything unparseable counts as blocked. */
function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);

  if (family === 4) {
    const value = ipv4ToInt(ip);
    if (value === null) return true;
    return BLOCKED_V4.some(([base, bits]) => {
      const baseValue = ipv4ToInt(base);
      if (baseValue === null) return true;
      const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
      return ((value & mask) >>> 0) === ((baseValue & mask) >>> 0);
    });
  }

  if (family === 6) {
    const value = ipv6ToBigInt(ip);
    if (value === null) return true;

    // ::ffff:0:0/96 wraps an IPv4 address, so judge it as one. Otherwise
    // ::ffff:127.0.0.1 would walk straight past the v6 checks.
    if (value >> 32n === 0xffffn) {
      const v4 = Number(value & 0xffffffffn);
      const dotted = [24, 16, 8, 0].map((s) => (v4 >>> s) & 0xff).join('.');
      return isBlockedIp(dotted);
    }

    return BLOCKED_V6.some(([base, bits]) => {
      const baseValue = ipv6ToBigInt(base);
      if (baseValue === null) return true;
      const shift = BigInt(128 - bits);
      return value >> shift === baseValue >> shift;
    });
  }

  return true;
}

/**
 * Whether a hostname is safe to fetch. Bare IPs are checked directly; names are
 * resolved first and rejected if any address they answer with is blocked, since
 * a name with several A records only has to point somewhere internal once.
 *
 * This resolves and then lets fetch resolve again, so a DNS rebind could in
 * principle slip between the two. What that buys an attacker is capped by what
 * comes back: only a text/html response is read at all, only its title is
 * returned, and only the first 200 characters of that.
 */
async function hostnameIsAllowed(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (isIP(host)) return !isBlockedIp(host);

  // Single-label and .local names only resolve to something on the private
  // side of the network, so there is nothing to look up.
  if (!host.includes('.') || host.toLowerCase().endsWith('.local')) return false;

  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0) return false;
    return !addresses.some((a) => isBlockedIp(a.address));
  } catch {
    return false;
  }
}

/**
 * Re-checks a URL on every redirect hop. normalizeUrl is the same allowlist the
 * link field uses, so a scheme the client would refuse to store is one the
 * server refuses to fetch.
 */
function parseFetchable(raw: string): URL | null {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Anything off the default ports is far more likely to be an internal
  // service than a page with an OG tag.
  if (url.port && url.port !== '80' && url.port !== '443') return null;

  return url;
}

/**
 * Releases a response we are not going to read. Without this the socket sits in
 * the connection pool waiting for a body nobody consumes, and gets torn down
 * later at a moment of Node's choosing rather than ours. Every ordinary
 * http -> https redirect hits this path.
 */
async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Already closed or errored, so there is nothing left to release.
  }
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;
  let drained = false;

  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        drained = true;
        break;
      }
      chunks.push(value);
      total += value.length;
    }
  } finally {
    // Only cancel if we stopped early. Cancelling a stream that already ended
    // does nothing; cancelling one mid-flight is what frees the socket.
    if (!drained) await reader.cancel().catch(() => {});
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder('utf-8').decode(buffer.slice(0, MAX_BYTES));
}

/** Fetches the page, re-validating the destination on each redirect. */
async function fetchHtml(startUrl: string): Promise<string | null> {
  let target = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = parseFetchable(target);
    if (!url) return null;
    if (!(await hostnameIsAllowed(url.hostname))) return null;

    // An explicit controller rather than AbortSignal.timeout, so the timer is
    // cleared the moment the hop finishes. AbortSignal.timeout's timer is
    // unref'd and so doesn't hold the process open, but it does stay armed for
    // the full 5s and can fire long after the request it belonged to is done.
    // Clearing it removes that window rather than relying on it being benign.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml',
          },
        });
      } catch {
        return null;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await discard(response);
        if (!location) return null;
        try {
          target = new URL(location, url).toString();
        } catch {
          return null;
        }
        continue;
      }

      const contentType =
        response.headers.get('content-type')?.toLowerCase() ?? '';
      const isHtml =
        contentType.includes('text/html') || contentType.includes('xhtml');
      if (!response.ok || !isHtml) {
        await discard(response);
        return null;
      }

      // Awaited, not returned directly, so the timeout still covers the body
      // read rather than being cleared the moment the headers land.
      return await readCapped(response);
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function clean(text: string): string {
  return decodeEntities(text).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
}

function extractTitle(html: string): string {
  // og:title is what the page wants to be shared as, so prefer it over <title>,
  // which often carries the site name as a suffix.
  const meta = html.match(
    /<meta[^>]+(?:property|name)\s*=\s*["']og:title["'][^>]*>/i,
  );
  if (meta) {
    const content = meta[0].match(/content\s*=\s*["']([^"']*)["']/i);
    if (content?.[1]) {
      const title = clean(content[1]);
      if (title) return title;
    }
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag?.[1]) return clean(titleTag[1]);

  return '';
}

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) {
    return json({ error: 'missing url' }, 400);
  }

  const url = parseFetchable(raw);
  if (!url) {
    return json({ error: 'unsupported url' }, 400);
  }

  const html = await fetchHtml(url.toString());
  if (html === null) {
    // The client treats a failure and an empty title the same way, falling back
    // to the favicon and host, so there is nothing to explain here.
    return json({ title: '' }, 200, 300);
  }

  return json({ title: extractTitle(html) }, 200, 60 * 60 * 24);
}

function json(body: unknown, status: number, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Public: the response depends only on the url in the query string, so a
      // shared cache in front of this is doing exactly the right thing. It is
      // also the cheapest defence there is, since a cached hit never reaches
      // the function at all.
      'cache-control': maxAge
        ? `public, max-age=${maxAge}, s-maxage=${maxAge}`
        : 'no-store',
    },
  });
}
