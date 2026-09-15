"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import DressAvailabilityCalendar from "@/components/DressAvailabilityCalendar";
import InterestedBookingButton from "@/components/InterestedBookingButton";
import DressPlaceholder from "@/components/ui/DressPlaceholder";
import StarRating from "@/components/ui/StarRating";
import {
  Dress,
  ReviewWithRenter,
  getApprovedDressById,
  getDressImageUrl,
  getDressReviews,
  incrementDressView,
} from "@/lib/api";
import { cameFromDressList } from "@/lib/auth";

function formatReviewDate(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export default function DressDetailClient({ id }: { id: string }) {
  const router = useRouter();

  const [dress, setDress] = useState<Dress | null>(null);
  const [reviews, setReviews] = useState<ReviewWithRenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  // Photo ids whose <img> failed to load - shown with the shared branded
  // placeholder instead of the browser's own broken-image UI.
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<number>>(new Set());
  // Bumped after a successful interested-booking submission to remount (and
  // so re-fetch) the calendar below - it otherwise only fetches once on
  // mount and would keep showing the pre-submission state until a full
  // page reload.
  const [calendarKey, setCalendarKey] = useState(0);
  // Guards against React Strict Mode's dev-only double-invoke of this
  // effect double-counting one page load as two views. Tracks the id
  // already counted (not just a boolean) so navigating to a different
  // dress - a genuinely new view - still counts normally.
  const countedViewForId = useRef<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const numericId = Number(id);

        if (!Number.isFinite(numericId)) {
          setError("השמלה לא נמצאה.");
          return;
        }

        const found = await getApprovedDressById(numericId);

        if (!found) {
          setError("השמלה לא נמצאה או שאינה זמינה יותר.");
          return;
        }

        setDress(found);

        // Fire-and-forget - never blocks or affects the page either way.
        if (countedViewForId.current !== found.id) {
          countedViewForId.current = found.id;
          incrementDressView(found.id);
        }
      } catch {
        setError("לא הצלחנו לטעון את פרטי השמלה. נסי שוב.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  // Separate from the dress load above (dress.reviewCount is just a number,
  // not the review list itself) - only fires once there's an approved dress
  // to show reviews for, not on every render.
  useEffect(() => {
    if (!dress) {
      return;
    }

    let cancelled = false;

    getDressReviews(dress.id)
      .then((data) => {
        if (!cancelled) {
          setReviews(data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [dress]);

  const photos = dress
    ? [...dress.photos].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const activePhoto = photos[activePhotoIndex];
  const activePhotoFailed = activePhoto ? failedPhotoIds.has(activePhoto.id) : false;

  // A plain <Link href="/"> always scrolls the catalog to the top, because
  // it's a fresh (push) navigation to that route - Next.js only preserves
  // scroll position on a true back/forward navigation. router.back() is a
  // real history pop, so the catalog is restored exactly where the user
  // left it. window.history.length can't tell us whether that pop is safe
  // - browsers already start a fresh tab at length 2 (a blank initial
  // document plus this page), so it's always "truthy" even with nothing
  // real to go back to; calling back() there leaves the app entirely
  // (blank tab) instead of landing back on the catalog. cameFromDressList()
  // is the real signal: it's only true when this page was actually reached
  // via a click from the catalog or favorites, in this tab.
  function goBackToCatalog() {
    if (cameFromDressList()) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <button
          type="button"
          onClick={goBackToCatalog}
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition hover:text-accent"
        >
          → חזרה לקטלוג
        </button>

        {loading ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="h-[480px] animate-pulse rounded-[28px] bg-zinc-200" />
            <div className="space-y-4">
              <div className="h-8 w-2/3 animate-pulse rounded bg-zinc-200" />
              <div className="h-5 w-1/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-24 w-full animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-20 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-4xl">
              👗
            </div>

            <h1 className="mt-6 text-2xl font-black text-zinc-900">
              {error}
            </h1>

            <button
              type="button"
              onClick={goBackToCatalog}
              className="mt-7 inline-flex rounded-full bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
            >
              חזרה לקטלוג
            </button>
          </div>
        ) : dress ? (
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Photos */}
            <div>
              <div
                className={`animate-fade-scale-in group relative overflow-hidden rounded-[28px] shadow-sm ring-1 ring-line ${
                  activePhoto && !activePhotoFailed
                    ? "h-[480px] bg-zinc-100"
                    : "h-[320px] bg-surface-sunken sm:h-[360px]"
                }`}
              >
                {activePhoto && !activePhotoFailed ? (
                  <img
                    key={activePhoto.id}
                    src={getDressImageUrl(activePhoto)}
                    alt={dress.name}
                    onError={() =>
                      setFailedPhotoIds((current) => new Set(current).add(activePhoto.id))
                    }
                    className="animate-fade-scale-in h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                  />
                ) : (
                  <DressPlaceholder key={activePhoto?.id ?? "none"} size="xl" />
                )}
              </div>

              {photos.length > 1 && (
                <div className="mt-4 flex gap-3 overflow-x-auto">
                  {photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setActivePhotoIndex(index)}
                      className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-2 transition ${
                        index === activePhotoIndex
                          ? "ring-accent"
                          : "ring-transparent hover:ring-zinc-200"
                      }`}
                    >
                      {failedPhotoIds.has(photo.id) ? (
                        <DressPlaceholder size="md" />
                      ) : (
                        <img
                          src={getDressImageUrl(photo)}
                          alt={`${dress.name} ${index + 1}`}
                          onError={() =>
                            setFailedPhotoIds((current) => new Set(current).add(photo.id))
                          }
                          className="h-full w-full object-cover"
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div>
              <p className="text-sm font-medium tracking-wide text-accent">
                {dress.category || "ללא קטגוריה"}
                {dress.color && ` · ${dress.color}`}
                {dress.city && ` · ${dress.city}`}
              </p>

              <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
                {dress.name}
              </h1>

              {dress.reviewCount > 0 && (
                <div className="mt-2">
                  <StarRating
                    rating={dress.averageRating}
                    count={dress.reviewCount}
                    size="md"
                  />
                </div>
              )}

              <p className="mt-1 text-xs font-medium text-zinc-400">
                {dress.viewCount} {dress.viewCount === 1 ? "צפייה" : "צפיות"}
              </p>

              {dress.description && (
                <p className="mt-5 text-base leading-7 text-zinc-600">
                  {dress.description}
                </p>
              )}

              <div className="mt-8 rounded-[20px] bg-white p-6 shadow-sm ring-1 ring-line">
                <h2 className="font-display text-lg font-semibold text-zinc-900">
                  מידות ומחירים
                </h2>

                {dress.sizes.length > 0 ? (
                  <ul className="mt-4 divide-y divide-zinc-100">
                    {dress.sizes.map((size) => (
                      <li
                        key={size.id}
                        className="flex items-center justify-between py-3"
                      >
                        <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-semibold text-zinc-700">
                          מידה {size.size}
                        </span>
                        <span className="text-base font-black text-zinc-900">
                          {size.price} ₪
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-zinc-400">
                    טרם הוגדרו מידות ומחירים לשמלה זו.
                  </p>
                )}
              </div>

              <InterestedBookingButton
                dressId={dress.id}
                ownerId={dress.ownerId}
                sizes={dress.sizes}
                onSuccess={() => setCalendarKey((key) => key + 1)}
              />

              <DressAvailabilityCalendar
                dressId={dress.id}
                sizes={dress.sizes}
                key={calendarKey}
              />
            </div>
          </div>
        ) : null}

        {dress && reviews.length > 0 && (
          <div className="mt-12 max-w-2xl">
            <h2 className="font-display flex items-center gap-3 text-2xl font-semibold text-zinc-900">
              ביקורות
              <StarRating rating={dress.averageRating} count={dress.reviewCount} size="md" />
            </h2>

            <ul className="mt-6 space-y-4">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="rounded-[20px] bg-white p-5 shadow-sm ring-1 ring-line"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-zinc-900">
                      {review.renter.name || "שוכרת"}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {formatReviewDate(review.createdAt)}
                    </span>
                  </div>

                  <div className="mt-1.5">
                    <StarRating rating={review.rating} />
                  </div>

                  {review.comment && (
                    <p className="mt-3 text-sm leading-6 text-zinc-600">
                      {review.comment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
