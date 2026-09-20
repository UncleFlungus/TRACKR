// URL normalization, scheme allowlisting and tracking-param stripping. Pulled
// out of link.tsx so the field and the /api/og function share one definition
// of what counts as a safe, clickable URL.

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto']);

// Pure tracking noise, stripped on normalize so stored URLs stay clean and
// previews key off a canonical form. Kept conservative: only well-known
// trackers, never a param a site might actually need.
//
// `s` and `ref` used to be in here and were wrong. `?s=` is WordPress site
// search, so stripping it turns a search results URL into a home page, and
// `ref` carries real meaning on plenty of sites. `ref_src` stays because it is
// specific to Twitter's share widget.
const TRACKING_PARAMS = [
  /^utm_/i, // utm_source, utm_medium, utm_campaign, utm_term, utm_content, ...
  /^fbclid$/i, // Facebook
  /^gclid$/i, // Google Ads
  /^dclid$/i, // DoubleClick
  /^gbraid$/i, // Google (iOS)
  /^wbraid$/i, // Google (web-to-app)
  /^msclkid$/i, // Microsoft Ads
  /^mc_eid$/i, // Mailchimp
  /^mc_cid$/i, // Mailchimp
  /^igshid$/i, // Instagram
  /^vero_id$/i, // Vero
  /^_hsenc$/i, // HubSpot
  /^_hsmi$/i, // HubSpot
  /^ref_src$/i, // Twitter/X
];

function isTrackingParam(key: string): boolean {
  return TRACKING_PARAMS.some((re) => re.test(key));
}

/**
 * Normalize and validate a user-entered URL against an allowlist of http,
 * https and mailto. Anything else (javascript:, data:, vbscript:, file:) is
 * rejected. A URL with no scheme gets https:// prepended; http and https URLs
 * also have their tracking params stripped and are re-serialized.
 *
 * Rejected input returns '', which callers read as "not a link".
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Detect a "scheme:" prefix. The character class follows the RFC 3986 scheme
  // grammar so paths like "a:b" don't misfire.
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):/);

  let candidate: string;
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (!ALLOWED_SCHEMES.has(scheme)) {
      // Reject javascript:, data:, vbscript:, file:, etc.
      return '';
    }
    candidate = trimmed;
  } else {
    // No scheme, so assume https.
    candidate = `https://${trimmed}`;
  }

  // mailto: has no query/host to clean; pass through once allowlisted.
  if (candidate.toLowerCase().startsWith('mailto:')) {
    return candidate;
  }

  // For http/https, parse and strip tracking params. Anything that won't parse
  // is rejected rather than stored in a form we can't reason about.
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const keysToDelete: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (isTrackingParam(k)) keysToDelete.push(k);
    });
    keysToDelete.forEach((k) => u.searchParams.delete(k));
    // Drop a now-empty "?" for tidiness.
    let out = u.toString();
    if (out.endsWith('?')) out = out.slice(0, -1);
    return out;
  } catch {
    return '';
  }
}

/**
 * Display host: "nytimes.com/some-article", without a leading www. or a
 * trailing slash. Falls back to the raw input when it doesn't parse.
 */
export function getDisplayHost(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'mailto:') return u.pathname; // the email address
    const path = u.pathname !== '/' ? u.pathname : '';
    return u.hostname.replace(/^www\./, '') + path;
  } catch {
    return url;
  }
}

/**
 * Favicon via Google's public service. Needs no server of our own and returns
 * a generic globe for sites without one, so the preview card always has an
 * icon. Sized for a small chip.
 */
export function faviconUrl(url: string, size = 32): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      u.hostname,
    )}&sz=${size}`;
  } catch {
    return '';
  }
}
