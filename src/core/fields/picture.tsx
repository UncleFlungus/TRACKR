import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import type { FieldTypeDef } from '../types';

interface PictureConfig {}

// Stored as an array of data URLs. Simple and self-contained — no separate
// blob store, no upload pipeline. Trade-off: a 4MB photo becomes a ~5.4MB
// string in IndexedDB. Fine for personal trackers; revisit if you find
// yourself storing hundreds of full-resolution photos.

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PictureInput({
  value,
  onChange,
}: {
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const items = value ?? [];

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const dataUrls = await Promise.all(Array.from(files).map(readFileAsDataURL));
    onChange([...items, ...dataUrls]);
  }

  return (
    <div className="py-1">
      <div className="flex flex-wrap gap-2 items-center">
        {items.map((src, i) => (
          <div
            key={i}
            className="relative w-16 h-16 rounded-lg overflow-hidden border border-grape-200 group/img"
          >
            <img src={src} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center"
              aria-label="Remove photo"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-16 h-16 rounded-lg border-2 border-dashed border-grape-200 hover:border-grape-300 hover:bg-grape-50 text-grape-400 flex items-center justify-center transition-colors"
          aria-label="Upload photos"
        >
          <Upload className="w-5 h-5" />
        </button>
        {/*
          To enable mobile camera capture: add capture="environment" to this input.
          Desktop will still show a normal file picker; mobile will offer the camera.
        */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

function PictureDisplay({ value }: { value: string[] | null }) {
  const items = value ?? [];
  if (items.length === 0) return <em className="text-grape-300 text-[15px]">none</em>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          className="w-14 h-14 object-cover rounded-md border border-grape-100"
        />
      ))}
    </div>
  );
}

export const pictureField: FieldTypeDef<PictureConfig, string[]> = {
  id: 'picture',
  label: 'Picture',
  icon: 'Image',
  defaultConfig: {},
  defaultValue: [],
  validate: (value) => {
    if (value == null) return null;
    if (!Array.isArray(value)) return 'Expected a list of images';
    return null;
  },
  Input: PictureInput as any,
  Display: PictureDisplay as any,
};
