'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { uploadVehiclePhotos } from '@/app/admin/actions';
import { Icon } from '@/components/Icon';

const MAX_PHOTOS = 40;

export function PhotoManager({ photos, onChange }: { photos: string[]; onChange: (next: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropHover, setDropHover] = useState(false);

  async function upload(files: FileList | File[]) {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)).slice(0, MAX_PHOTOS - photos.length);
    if (!list.length) return;
    setError('');
    setUploading(list.length);
    let current = photos;
    // Upload in small batches so large phone photos don't hit the request size limit.
    for (let i = 0; i < list.length; i += 4) {
      const fd = new FormData();
      list.slice(i, i + 4).forEach((f) => fd.append('files', f));
      const res = await uploadVehiclePhotos(fd);
      current = [...current, ...res.urls];
      onChange(current);
      setUploading((n) => Math.max(0, n - 4));
      if (res.error) {
        setError(res.error);
        break;
      }
    }
    setUploading(0);
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5">
        {photos.map((src, i) => (
          <div
            key={src}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragFrom !== null) move(dragFrom, i);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
            className={`group relative aspect-[4/3] cursor-grab overflow-hidden rounded-[10px] border-2 bg-[#1c1c1f] active:cursor-grabbing ${
              i === 0 ? 'border-octane sm:col-span-2 sm:row-span-2 sm:aspect-auto' : 'border-transparent'
            } ${dragFrom === i ? 'opacity-40' : ''}`}
          >
            <Image src={src} alt={`Photo ${i + 1}`} fill sizes="(min-width: 640px) 280px, 50vw" className="object-cover" draggable={false} />
            {i === 0 && <span className="absolute left-2 top-2 rounded-md bg-octane px-2 py-0.5 text-[11.5px] font-bold text-ink">Cover</span>}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent p-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <div className="flex gap-1">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move photo ${i + 1} left`} className="flex size-8 items-center justify-center rounded-md bg-black/70 disabled:opacity-30">
                  <Icon name="chevron-left" size={16} />
                </button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === photos.length - 1} aria-label={`Move photo ${i + 1} right`} className="flex size-8 items-center justify-center rounded-md bg-black/70 disabled:opacity-30">
                  <Icon name="chevron-right" size={16} />
                </button>
              </div>
              <div className="flex gap-1">
                {i > 0 && (
                  <button type="button" onClick={() => move(i, 0)} aria-label={`Make photo ${i + 1} the cover`} title="Make cover" className="flex size-8 items-center justify-center rounded-md bg-black/70 hover:text-octane">
                    <Icon name="star" size={15} />
                  </button>
                )}
                <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`} className="flex size-8 items-center justify-center rounded-md bg-black/70 hover:text-bad">
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDropHover(true);
            }}
            onDragLeave={() => setDropHover(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropHover(false);
              if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
            }}
            className={`flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed p-3 text-center text-[13.5px] text-[#a1a1aa] transition-colors ${
              photos.length ? '' : 'col-span-full min-h-44'
            } ${dropHover ? 'border-octane bg-octane/10' : 'border-[#3a3a40] bg-[#0e0e10] hover:border-[#52525b]'}`}
          >
            <Icon name="upload" size={22} className="text-octane" />
            {uploading ? (
              <span className="font-semibold text-chalk">Uploading {uploading}…</span>
            ) : (
              <>
                <span>
                  <strong className="text-chalk">Drop photos</strong> or click to upload
                </span>
                <span className="text-xs text-[#71717a]">JPG, PNG or WebP · resized automatically</span>
              </>
            )}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) upload(e.target.files);
          e.target.value = '';
        }}
      />
      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
