import { authorStyle, type AuthorMap } from '@/core/authors';
import { COLOR_THEMES } from '../colors';

/**
 * Who logged an entry. Only rendered on shared trackers: on a tracker of one
 * every entry has the same author, so labelling them is noise.
 *
 * The dot carries the colour so the name can stay quiet. Scanning a list of
 * short entries, the colour is what you actually read.
 */
export default function AuthorTag({
  authors,
  authorId,
  size = 'md',
}: {
  authors: AuthorMap;
  authorId: string | null | undefined;
  size?: 'sm' | 'md';
}) {
  const { label, colorKey } = authorStyle(authors, authorId);
  const swatch = COLOR_THEMES[colorKey]?.swatch ?? COLOR_THEMES.slate.swatch;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-grape-400 shrink-0 ${
        size === 'sm' ? 'text-[10px]' : 'text-[11px]'
      }`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: swatch }}
      />
      <span className="font-semibold uppercase tracking-wide truncate max-w-24">
        {label}
      </span>
    </span>
  );
}
