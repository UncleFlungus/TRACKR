// src/core/url.ts
//
// URL normalization, scheme allowlisting, and tracking-param stripping.
// Pulled out of link.tsx so both the field and the /api/og function can share
// the exact same allowlist (a single source of truth for what counts as a
// safe, clickable URL).

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto']);

// Query params that are pure tracking noise — stripped on normalize so stored
// URLs stay clean and previews key off a canonical form. Conservative on
// purpose: only well-known trackers, never anything that could be load-bearing.
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
  /^ref$/i, // generic referrer tag
  /^ref_src$/i, // Twitter/X
  /^s$/i, // Twitter/X share id (e.g. ?s=20)
];

function isTrackingParam(key: string): boolean {
  return TRACKING_PARAMS.some((re) => re.test(key));
}

/**
 * Normalize and validate a user-entered URL.
 *
 * Allowlist approach: only http/https/mailto schemes are accepted. Anything
 * else (javascript:, data:, vbscript:, file:, etc) is rejected by returning an
 * empty string. URLs without a scheme get `https://` prepended. http/https
 * URLs additionally get tracking params stripped and are re-serialized into a
 * canonical form.
 *
 * Returns '' for anything rejected — callers treat empty as "not a link."
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Detect a "scheme:" prefix (case-insensitive). The character class matches
  // the RFC 3986 scheme grammar so we don't misfire on things like "a:b" paths.
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
    // No scheme — assume https.
    candidate = `https://${trimmed}`;
  }

  // mailto: has no query/host to clean; pass through once allowlisted.
  if (candidate.toLowerCase().startsWith('mailto:')) {
    return candidate;
  }

  // For http/https, parse and strip tracking params. If it won't parse as a
  // URL, reject it rather than store something we can't reason about.
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
 * Human-friendly host string for display: "nytimes.com/some-article" with the
 * leading www. removed and the trailing "/" hidden. Falls back to the raw
 * input if it doesn't parse.
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
 * Favicon URL via Google's public favicon service. No server round-trip needed
 * and it handles the "site has no favicon" case with a generic globe, so the
 * preview card always has an icon. Size is tuned for a small chip.
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
