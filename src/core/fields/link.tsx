import { ExternalLink } from 'lucide-react';
import type { FieldTypeDef } from '../types';

interface LinkConfig {
  placeholder?: string;
}
/**
 * Normalize and validate a user-entered URL.
 *
 * Allowlist approach: only http/https/mailto schemes are accepted. Anything
 * else (javascript:, data:, vbscript:, file:, etc) is rejected by returning
 * an empty string. URLs without a scheme get `https://` prepended.
 *
 * The previous version of this function relied on the side-effect that
 * `https://javascript:foo` was a harmless mangled URL. That worked but was
 * fragile — a future refactor that preserved user-supplied schemes would
 * silently re-introduce a clickable javascript: link. This version is
 * deliberate about what it allows.
 */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Detect schemes by checking for "scheme:" prefix (case-insensitive).
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):/);

  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') {
      return trimmed;
    }
    // Reject everything else (javascript:, data:, etc).
    return '';
  }

  // No scheme: prepend https://
  return `https://${trimmed}`;
}

function getDisplayHost(url: string): string {
  try {
    const u = new URL(url);
    return (
      u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '')
    );
  } catch {
    return url;
  }
}

export const linkField: FieldTypeDef<LinkConfig, string> = {
  id: 'link',
  label: 'Link',
  icon: 'Link',
  defaultConfig: { placeholder: 'https://...' },
  defaultValue: '',
  validate: (value) => {
    if (!value) return null;
    if (typeof value !== 'string') return 'Invalid link';
    // Permissive — we normalize on the way in, so anything non-empty is OK
    return null;
  },
  Input: ({ value, onChange, config, autoFocus, placeholder }) => (
    <input
      type="text"
      inputMode="url"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        // Normalize on blur — so user types "claude.com", we save "https://claude.com"
        const normalized = normalizeUrl(e.target.value);
        if (normalized !== e.target.value) onChange(normalized);
      }}
      placeholder={placeholder ?? config.placeholder ?? 'https://...'}
      autoFocus={autoFocus}
      className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 focus:outline-none"
    />
  ),
  Display: ({ value }) => {
    if (!value || typeof value !== 'string') return null;
    const url = normalizeUrl(value);
    if (!url) {
      // Rejected by allowlist — show as plain text so user knows it's not a link.
      return <span className="text-grape-400 italic">{value}</span>;
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="..." // your existing styling
      >
        {value}
      </a>
    );
  },
};
