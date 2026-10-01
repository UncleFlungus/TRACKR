import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { FieldTypeDef } from '../types';
import { normalizeUrl, getDisplayHost } from '../url';

interface ImageConfig {
  placeholder?: string;
}

/**
 * The URL to put in an <img src>, or null. Only http and https get through:
 * normalizeUrl also allows mailto, which means nothing as an image, and a value
 * written by another client could be anything at all.
 */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const url = normalizeUrl(value);
  return url.startsWith('https://') || url.startsWith('http://') ? url : null;
}

/**
 * The image itself. No referrer is sent, so the host doesn't learn which
 * tracker it's being shown in. A failed load shows the host instead of the
 * browser's broken-image icon.
 */
export function ImagePreview({
  url,
  className = 'max-h-48',
}: {
  url: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [lastUrl, setLastUrl] = useState(url);
  if (url !== lastUrl) {
    setLastUrl(url);
    setFailed(false);
  }

  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-grape-400 text-[13px]">
        <ImageOff className="w-4 h-4 shrink-0" />
        <span className="truncate">{getDisplayHost(url)}</span>
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`block max-w-full rounded-lg object-cover ${className}`}
    />
  );
}

function ImageInput({
  value,
  onChange,
  config,
  autoFocus,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  config: ImageConfig;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const preview = safeImageUrl(value);

  function commit(raw: string) {
    if (!raw.trim()) {
      setInvalid(false);
      onChange(null);
      return;
    }
    const url = safeImageUrl(raw);
    setInvalid(!url);
    if (url) {
      setText(url);
      onChange(url);
    } else {
      onChange(null);
    }
  }

  return (
    <div className="w-full">
      <input
        type="text"
        inputMode="url"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (invalid) setInvalid(false);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder={
          placeholder ?? config.placeholder ?? 'https://.../picture.jpg'
        }
        autoFocus={autoFocus}
        className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 focus:outline-none"
      />
      {invalid && (
        <p className="text-rose-600 text-[12px] mt-1">
          That needs to be an http or https link to an image.
        </p>
      )}
      {preview && (
        <div className="mt-1.5">
          <ImagePreview url={preview} className="max-h-32" />
        </div>
      )}
    </div>
  );
}

export const imageField: FieldTypeDef<ImageConfig, string> = {
  id: 'image',
  label: 'Image',
  icon: 'Image',
  defaultConfig: { placeholder: '' },
  defaultValue: null,
  validate: (value) => {
    if (value == null || value === '') return null;
    return safeImageUrl(value) ? null : 'Expected an http or https image link';
  },
  // A value that wouldn't render counts as empty, so it hides with the rest.
  isEmpty: (value) => !safeImageUrl(value),
  Input: ImageInput,
  Display: ({ value }) => {
    const url = safeImageUrl(value);
    if (!url) return <em className="text-grape-300 text-[15px]">empty</em>;
    return <ImagePreview url={url} />;
  },
};
