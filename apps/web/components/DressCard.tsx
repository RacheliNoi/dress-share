"use client";

import Link from "next/link";
import { CSSProperties, useState } from "react";
import { Dress, getDressImageUrl } from "@/lib/api";
import DressPlaceholder from "@/components/ui/DressPlaceholder";

function getPriceLabel(dress: Dress) {
  if (dress.sizes.length === 0) {
    return null;
  }

  const prices = dress.sizes.map((size) => size.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (min === max) {
    return { eyebrow: "מחיר", value: `${min} ₪` };
  }

  return { eyebrow: "החל מ־", value: `${min} ₪` };
}

export default function DressCard({
  dress,
  style,
  sizeAvailability,
}: {
  dress: Dress;
  style?: CSSProperties;
  // Set only when a catalog date filter is active - drives per-size
  // available/blocked chip styling below without affecting whether the
  // dress is shown at all (that's already decided by the caller).
  sizeAvailability?: { available: string[]; blocked: string[] } | null;
}) {
  const photo = [...dress.photos].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )[0];
  const imageUrl = photo ? getDressImageUrl(photo) : null;
  const price = getPriceLabel(dress);

  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <Link
      href={`/dress/${dress.id}`}
      style={style}
      className="animate-fade-scale-in group block overflow-hidden rounded-[20px] bg-white ring-1 ring-zinc-200/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_-15px_rgba(34,31,31,0.18)]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-100">
        {showImage ? (
          <img
            src={imageUrl ?? undefined}
            alt={dress.name}
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <DressPlaceholder size="lg" />
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-success shadow-sm backdrop-blur sm:right-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          זמינה להשכרה
        </div>

        {dress.photos.length > 1 && (
          <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur sm:bottom-4 sm:left-4 sm:px-3 sm:py-1.5 sm:text-xs">
            📷 {dress.photos.length}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-zinc-900 sm:text-lg">
              {dress.name}
            </h3>

            <p className="mt-1 truncate text-xs text-zinc-500 sm:text-sm">
              {dress.category || "ללא קטגוריה"}
              {dress.color && ` · ${dress.color}`}
            </p>
          </div>

          {price && (
            <div className="shrink-0 text-left">
              <p className="text-[10px] uppercase tracking-wide text-zinc-400">
                {price.eyebrow}
              </p>
              <p className="mt-0.5 whitespace-nowrap text-sm font-black text-zinc-900">
                {price.value}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
          {dress.sizes.length > 0 ? (
            dress.sizes.map((size) => {
              const isBlockedOnDate = sizeAvailability?.blocked.includes(size.size);

              return (
                <span
                  key={size.id}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-3 sm:py-1.5 sm:text-xs ${
                    isBlockedOnDate
                      ? "bg-zinc-50 text-zinc-300 line-through"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {size.size}
                </span>
              );
            })
          ) : (
            <span className="text-[11px] text-zinc-400 sm:text-xs">
              טרם הוגדרו מידות
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
