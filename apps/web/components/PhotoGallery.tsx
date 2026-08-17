"use client";

import { useState } from "react";
import { DressPhoto, getDressImageUrl } from "@/lib/api";

export default function PhotoGallery({
  photos,
  alt,
}: {
  photos: DressPhoto[];
  alt: string;
}) {
  const sorted = [...photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const [index, setIndex] = useState(0);

  if (sorted.length === 0) {
    return (
      <div className="flex h-56 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-rose-50 via-zinc-50 to-purple-50 text-5xl sm:h-44">
        👗
      </div>
    );
  }

  const current = sorted[Math.min(index, sorted.length - 1)];

  function goPrev() {
    setIndex((current) => (current - 1 + sorted.length) % sorted.length);
  }

  function goNext() {
    setIndex((current) => (current + 1) % sorted.length);
  }

  return (
    <div className="w-full">
      <div className="relative h-56 w-full overflow-hidden rounded-2xl bg-zinc-100 sm:h-44">
        <img
          src={getDressImageUrl(current)}
          alt={alt}
          className="h-full w-full object-cover"
        />

        {sorted.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="התמונה הקודמת"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
            >
              ‹
            </button>

            <button
              type="button"
              onClick={goNext}
              aria-label="התמונה הבאה"
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
            >
              ›
            </button>

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
              {index + 1} / {sorted.length}
            </div>
          </>
        )}
      </div>

      {sorted.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {sorted.map((photo, photoIndex) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setIndex(photoIndex)}
              aria-label={`מעבר לתמונה ${photoIndex + 1}`}
              className={`h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                photoIndex === index
                  ? "ring-rose-400"
                  : "ring-transparent hover:ring-zinc-300"
              }`}
            >
              <img
                src={getDressImageUrl(photo)}
                alt={`${alt} ${photoIndex + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
