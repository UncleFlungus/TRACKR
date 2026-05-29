import { ExternalLink } from 'lucide-react';
import type { FieldTypeDef } from '../types';

interface LinkConfig {
  placeholder?: string;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // If user typed "claude.com" or "www.claude.com" with no scheme, prepend https://
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function getDisplayHost(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
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
    if (!value) return <em className="text-grape-300 text-[15px]">no link</em>;
    const url = normalizeUrl(value);
    const display = getDisplayHost(url);
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 hover:underline text-[15px] truncate"
      >
        {display}
        <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
      </a>
    );
  },
};