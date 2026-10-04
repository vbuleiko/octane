'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

export function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const thumbs = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const count = photos.length;

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    thumbs.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);

  useEffect(() => {
    if (!full) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [full, go]);

  if (!count) {
    return <div className="flex aspect-[4/3] items-center justify-center bg-panel text-ash">Photos coming soon</div>;
  }

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (touchX.current = e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      touchX.current = null;
    },
  };

  const arrows = (big = false) =>
    count > 1 && (
      <>
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous photo"
          className={`absolute left-3 top-1/2 flex -translate-y-1/2 items-center justify-center bg-ink/80 text-chalk transition-colors hover:bg-octane hover:text-ink ${big ? 'size-14' : 'size-12'}`}
        >
          <Icon name="chevron-left" size={big ? 28 : 24} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next photo"
          className={`absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center bg-ink/80 text-chalk transition-colors hover:bg-octane hover:text-ink ${big ? 'size-14' : 'size-12'}`}
        >
          <Icon name="chevron-right" size={big ? 28 : 24} strokeWidth={2.4} />
        </button>
      </>
    );

  return (
    <div className="flex flex-col gap-2.5" aria-roledescription="carousel" aria-label={`${alt} photos`}>
      <div className="relative aspect-[4/3] overflow-hidden bg-panel" {...swipe}>
        <Image
          key={photos[index]}
          src={photos[index]}
          alt={`${alt} — photo ${index + 1} of ${count}`}
          fill
          priority={index === 0}
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover"
        />
        {arrows()}
        <button
          type="button"
          onClick={() => setFull(true)}
          aria-label="View photos full screen"
          className="absolute right-3 top-3 flex size-11 items-center justify-center bg-ink/80 text-chalk hover:bg-octane hover:text-ink"
        >
          <Icon name="expand" size={20} />
        </button>
        <span className="racing absolute bottom-3 left-3 bg-ink/85 px-3 py-1 text-sm tracking-normal" aria-live="polite">
          {index + 1} / {count}
        </span>
      </div>
      {count > 1 && (
        <div ref={thumbs} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {photos.map((src, i) => (
            <button
              key={src}
              type="button"
              data-i={i}
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              className={`relative aspect-[4/3] w-24 shrink-0 overflow-hidden border-2 sm:w-28 ${i === index ? 'border-octane' : 'border-transparent opacity-70 hover:opacity-100'}`}
            >
              <Image src={src} alt="" fill sizes="112px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
      {full && (
        <div role="dialog" aria-modal="true" aria-label={`${alt} photos`} className="fixed inset-0 z-50 flex flex-col bg-black/95" {...swipe}>
          <div className="flex items-center justify-between p-4">
            <span className="racing text-lg tracking-normal">
              {index + 1} / {count}
            </span>
            <button type="button" onClick={() => setFull(false)} aria-label="Close" className="flex size-12 items-center justify-center border-2 border-chalk">
              <Icon name="close" size={22} strokeWidth={2.4} />
            </button>
          </div>
          <div className="relative flex-1">
            <Image src={photos[index]} alt={`${alt} — photo ${index + 1} of ${count}`} fill sizes="100vw" className="object-contain" />
            {arrows(true)}
          </div>
        </div>
      )}
    </div>
  );
}
