// src/core/fields/link.tsx
import { useState } from 'react';
import { ExternalLink, Link as LinkIcon } from 'lucide-react';
import type { FieldTypeDef } from '../types';
import { normalizeUrl, getDisplayHost, faviconUrl } from '../url';

interface LinkConfig {
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Value shape
// ---------------------------------------------------------------------------
// Old entries stored a bare string ("https://..."). New entries store a small
// object with the cached preview so the Display renders with zero network.
// Both shapes are read transparently via `readValue` below, so existing data
// keeps working and no migration is required.
//
//   legacy:  "https://nytimes.com/article"
//   current: { url: "https://...", title: "Some headline" }
//
// The favicon is NOT stored — it's derived from the url at render time via
// Google's favicon service, so it stays fresh and costs no storage.

interface LinkValue {
  url: string;
  title?: string;
}

type StoredLink = string | LinkValue | null;

function readValue(value: StoredLink): LinkValue | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    return value ? { url: value } : null;
  }
  if (typeof value === 'object' && typeof value.url === 'string') {
    return value.url ? { url: value.url, title: value.title } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Preview fetch (calls the serverless /api/og with SSRF guards)
// ---------------------------------------------------------------------------

async function fetchPreviewTitle(url: string): Promise<string> {
  try {
    const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
    if (!res.ok) return '';
    const data = (await res.json()) as { title?: string };
    return data.title ?? '';
  } catch {
    return ''; // fail soft — card falls back to favicon + host
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function LinkInput({
  value,
  onChange,
  config,
  autoFocus,
  placeholder,
}: {
  value: StoredLink;
  onChange: (v: StoredLink) => void;
  config: LinkConfig;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const current = readValue(value);
  // The text field is always editable as a raw string; we only fold it into a
  // {url, title} object on blur, after normalize + preview fetch.
  const [text, setText] = useState(current?.url ?? '');

  async function commit(raw: string) {
    const normalized = normalizeUrl(raw);
    if (!normalized) {
      onChange(raw.trim() ? raw.trim() : null);
      return;
    }
    onChange({ url: normalized }); // no title fetch
    setText(normalized);
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="url"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder={placeholder ?? config.placeholder ?? 'https://...'}
          autoFocus={autoFocus}
          className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 focus:outline-none"
        />
      </div>
      {/* Live preview of what will be saved */}
      {current && <LinkChip value={current} interactive={false} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview chip — favicon + title + clean host. Used in both Input and Display.
// ---------------------------------------------------------------------------

function LinkChip({
  value,
  interactive = true,
}: {
  value: LinkValue;
  interactive?: boolean;
}) {
  const normalized = normalizeUrl(value.url);

  // Allowlist rejected it → render inert text, never a clickable anchor.
  if (!normalized) {
    return (
      <span className="text-grape-400 italic text-[14px]">{value.url}</span>
    );
  }

  const host = getDisplayHost(normalized);
  const favicon = faviconUrl(normalized);
  const title = value.title?.trim();

  const inner = (
    <>
      {favicon ? (
        <img
          src={favicon}
          alt=""
          width={16}
          height={16}
          className="w-4 h-4 rounded-sm shrink-0"
          // If the favicon service 404s, hide the broken-image glyph.
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <LinkIcon className="w-4 h-4 shrink-0 text-grape-400" />
      )}
      <span className="min-w-0">
        {title ? (
          <span className="block truncate text-grape-900 text-[14px] font-medium leading-tight">
            {title}
          </span>
        ) : null}
        <span className="block truncate text-grape-500 text-[12px] leading-tight">
          {host}
        </span>
      </span>
      <ExternalLink className="w-3 h-3 shrink-0 opacity-50 text-grape-400 ml-auto" />
    </>
  );

  const className =
    'inline-flex items-center gap-2 max-w-full mt-1.5 bg-white border border-grape-200 rounded-lg px-2.5 py-1.5 ' +
    (interactive
      ? 'hover:border-grape-300 hover:bg-grape-50 transition-colors'
      : '');

  if (!interactive) {
    return <span className={className}>{inner}</span>;
  }

  return (
    <a
      href={normalized}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className}
    >
      {inner}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Field definition
// ---------------------------------------------------------------------------

export const linkField: FieldTypeDef<LinkConfig, StoredLink> = {
  id: 'link',
  label: 'Link',
  icon: 'Link',
  defaultConfig: { placeholder: 'https://...' },
  defaultValue: '',
  validate: (value) => {
    if (value == null || value === '') return null;
    // Accept both legacy strings and the new object shape.
    if (typeof value === 'string') return null;
    if (
      typeof value === 'object' &&
      typeof (value as LinkValue).url === 'string'
    )
      return null;
    return 'Invalid link';
  },
  isEmpty: (value) => readValue(value as StoredLink) == null,
  Input: LinkInput as any,
  Display: (({ value }: { value: StoredLink }) => {
    const v = readValue(value);
    if (!v) return <em className="text-grape-300 text-[15px]">no link</em>;
    return <LinkChip value={v} />;
  }) as any,
};
