"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import DressAvailabilityCalendar from "@/components/DressAvailabilityCalendar";
import InterestedBookingButton from "@/components/InterestedBookingButton";
import DressPlaceholder from "@/components/ui/DressPlaceholder";
import { Dress, getApprovedDressById, getDressImageUrl } from "@/lib/api";

export default function DressDetailsPage() {
  const params = useParams<{ id: string }>();

  const [dress, setDress] = useState<Dress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  // Photo ids whose <img> failed to load - shown with the shared branded
  // placeholder instead of the browser's own broken-image UI.
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const id = Number(params.id);

        if (!Number.isFinite(id)) {
          setError("השמלה לא נמצאה.");
          return;
        }

        const found = await getApprovedDressById(id);

        if (!found) {
          setError("השמלה לא נמצאה או שאינה זמינה יותר.");
          return;
        }

        setDress(found);
      } catch {
        setError("לא הצלחנו לטעון את פרטי השמלה. נסי שוב.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params.id]);

  const photos = dress
    ? [...dress.photos].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const activePhoto = photos[activePhotoIndex];
  const activePhotoFailed = activePhoto ? failedPhotoIds.has(activePhoto.id) : false;

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition hover:text-accent"
        >
          → חזרה לקטלוג
        </Link>

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

            <Link
              href="/"
              className="mt-7 inline-flex rounded-full bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
            >
              חזרה לקטלוג
            </Link>
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
              </p>

              <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
                {dress.name}
              </h1>

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
              />

              <DressAvailabilityCalendar dressId={dress.id} sizes={dress.sizes} />
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
