"use client";

import Link from "next/link";
import { CSSProperties, useState } from "react";
import { Dress, getDressImageUrl } from "@/lib/api";
import DressPlaceholder from "@/components/ui/DressPlaceholder";

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}

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
  isFavorited,
  onToggleFavorite,
}: {
  dress: Dress;
  style?: CSSProperties;
  // Set only when a catalog date filter is active - drives per-size
  // available/blocked chip styling below without affecting whether the
  // dress is shown at all (that's already decided by the caller).
  sizeAvailability?: { available: string[]; blocked: string[] } | null;
  // Favoriting is opt-in per usage - omit both props (e.g. on the owner's
  // own "my dresses" list) and the heart button simply doesn't render.
  isFavorited?: boolean;
  onToggleFavorite?: (dress: Dress) => void;
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
      className="animate-fade-scale-in group block overflow-hidden rounded-[20px] bg-white ring-1 ring-line transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_-15px_rgba(34,31,31,0.18)] hover:ring-accent-soft-strong"
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

        {onToggleFavorite && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleFavorite(dress);
            }}
            aria-label={isFavorited ? "הסרה ממועדפים" : "הוספה למועדפים"}
            aria-pressed={isFavorited}
            className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-110 sm:left-4 sm:top-4"
          >
            <svg
              className={`h-4 w-4 transition-colors ${isFavorited ? "text-accent" : "text-zinc-400"}`}
              viewBox="0 0 24 24"
              fill={isFavorited ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M12 20.5s-7.6-4.6-10.2-9.2C.3 8.4 1.6 4.9 5 4a5 5 0 0 1 7 1.5A5 5 0 0 1 19 4c3.4.9 4.7 4.4 3.2 7.3C19.6 15.9 12 20.5 12 20.5Z" />
            </svg>
          </button>
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
              <p className="mt-0.5 whitespace-nowrap text-sm font-black text-zinc-900 transition-colors duration-300 group-hover:text-accent">
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

        <div className="mt-3 flex items-center gap-x-3 overflow-hidden border-t border-line pt-3 text-xs text-zinc-400 sm:mt-4">
          <span className="flex shrink-0 items-center gap-1">
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            {formatShortDate(dress.createdAt)}
          </span>

          {dress.city && (
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="truncate">{dress.city}</span>
            </span>
          )}

          <span className="flex shrink-0 items-center gap-1">
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {dress.viewCount}
          </span>
        </div>
      </div>
    </Link>
  );
}
