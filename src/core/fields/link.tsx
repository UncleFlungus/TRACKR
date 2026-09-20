import { useRef, useState } from 'react';
import { ExternalLink, Link as LinkIcon } from 'lucide-react';
import type { FieldTypeDef } from '../types';
import { normalizeUrl, getDisplayHost, faviconUrl } from '../url';
import { clearPendingValue, registerPendingValue } from './pendingValues';

interface LinkConfig {
  placeholder?: string;
}

// Old entries stored a bare string, "https://nytimes.com/article". New ones
// store { url, title } so Display renders the cached preview without hitting
// the network. `readValue` handles both, so old data needs no migration.
//
// The favicon isn't stored. It's derived from the url at render time through
// Google's favicon service, which keeps it fresh and costs no storage.

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

// Preview fetch, via the serverless /api/og endpoint and its SSRF guards. The
// endpoint is open, so this works signed out too.
//
// Success and failure stay separate outcomes rather than both collapsing to an
// empty string. That collapsing is what let an earlier version look like it was
// fetching titles when it never called at all.

type PreviewResult = { status: 'ok'; title: string } | { status: 'failed' };

async function fetchPreviewTitle(url: string): Promise<PreviewResult> {
  try {
    const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
    if (!res.ok) return { status: 'failed' };
    const body = (await res.json()) as { title?: string };
    return { status: 'ok', title: body.title ?? '' };
  } catch {
    return { status: 'failed' };
  }
}

function LinkInput({
  value,
  onChange,
  config,
  autoFocus,
  placeholder,
  trackerId,
  fieldId,
}: {
  value: StoredLink;
  onChange: (v: StoredLink) => void;
  config: LinkConfig;
  autoFocus?: boolean;
  placeholder?: string;
  trackerId?: string;
  fieldId?: string;
}) {
  const current = readValue(value);
  // Editable as a raw string throughout; only folded into {url, title} on blur,
  // after normalize and the preview fetch.
  const [text, setText] = useState(current?.url ?? '');
  const [note, setNote] = useState<string | null>(null);
  // Stops a slow response for a URL the user has already replaced from
  // overwriting the newer one.
  const requestId = useRef(0);

  async function commit(raw: string) {
    const normalized = normalizeUrl(raw);
    if (!normalized) {
      requestId.current++;
      clearPendingValue(trackerId, fieldId);
      setNote(null);
      onChange(raw.trim() ? raw.trim() : null);
      return;
    }

    const id = ++requestId.current;
    // Show the URL straight away. The field shouldn't sit empty waiting on a
    // title, and there may not turn out to be one.
    onChange({ url: normalized });
    setText(normalized);
    setNote(null);

    // Clicking "Save entry" is itself what blurs this input, so the form can
    // submit before the title lands. Register the work and let the form wait
    // for it; what this resolves to is what actually gets written.
    const work = (async (): Promise<LinkValue | undefined> => {
      const result = await fetchPreviewTitle(normalized);

      // A newer URL has been committed, so this answer is for the wrong one.
      if (id !== requestId.current) return undefined;

      if (result.status === 'failed') {
        setNote("Couldn't load the title, but the link is saved.");
        return { url: normalized };
      }
      const next: LinkValue = result.title
        ? { url: normalized, title: result.title }
        : { url: normalized };
      onChange(next);
      return next;
    })();

    registerPendingValue(trackerId, fieldId, work);
    await work;
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="url"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (note) setNote(null);
          }}
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
      {note && <p className="text-grape-400 text-[12px] mt-1">{note}</p>}
    </div>
  );
}

// Favicon, title and clean host. Used by both Input and Display.

function LinkChip({
  value,
  interactive = true,
}: {
  value: LinkValue;
  interactive?: boolean;
}) {
  const normalized = normalizeUrl(value.url);

  // Rejected by the allowlist: render inert text, never a clickable anchor.
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
