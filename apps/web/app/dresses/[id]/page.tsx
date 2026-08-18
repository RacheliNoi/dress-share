"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { ApiError, Dress, getDressImageUrl, getMyDresses } from "@/lib/api";
import Header from "@/components/Header";
import DressAvailabilityManager from "@/components/DressAvailabilityManager";

function StatusPanel({ dress }: { dress: Dress }) {
  switch (dress.status) {
    case "DRAFT":
      return (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <p className="text-sm font-bold text-zinc-700">השמלה בטיוטה</p>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            השמלה עדיין לא נשלחה לאישור מנהל. השלימי את הפרטים, המידות
            והתמונות, ושלחי אותה לבדיקה.
          </p>
          <a
            href={`/dresses/${dress.id}/edit`}
            className="mt-4 inline-flex rounded-xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-zinc-700"
          >
            המשך עריכה
          </a>
        </div>
      );

    case "REJECTED":
      return (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-bold text-red-700">
            השמלה נדחתה לאישור
          </p>

          <p className="mt-1 text-sm leading-6 text-red-700">
            {dress.rejectionReason || "לא צוינה סיבה."}
          </p>

          <a
            href={`/dresses/${dress.id}/edit`}
            className="mt-4 inline-flex rounded-xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-zinc-700"
          >
            עריכת השמלה ושליחה מחדש לאישור
          </a>
        </div>
      );

    case "PENDING_APPROVAL":
      return (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-bold text-amber-700">
            ממתינה לאישור מנהל
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-700">
            השמלה נשלחה לבדיקה ותופיע בקטלוג הציבורי לאחר שתאושר. לא ניתן
            לערוך אותה בזמן שהיא ממתינה לאישור.
          </p>
        </div>
      );

    case "APPROVED":
      if (dress.pendingReviewSubmittedAt) {
        return (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-bold text-amber-700">
              העריכה שלך ממתינה לאישור מנהל
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-700">
              הציבור עדיין רואה את הגרסה המאושרת הנוכחית. השינויים שהצעת
              יופיעו בקטלוג רק לאחר אישור מנהל. לא ניתן לערוך שוב עד להחלטה.
            </p>
          </div>
        );
      }

      return (
        <div className="mt-6 space-y-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-700">
              מאושרת וזמינה להשכרה
            </p>
            <p className="mt-1 text-sm leading-6 text-emerald-700">
              השמלה מאושרת ומוצגת בקטלוג הציבורי.
            </p>

            <a
              href={`/dresses/${dress.id}/edit`}
              className="mt-4 inline-flex rounded-xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-zinc-700"
            >
              ערוך שמלה
            </a>
          </div>

          {dress.rejectionReason && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-bold text-red-700">
                העריכה האחרונה שלך נדחתה
              </p>
              <p className="mt-1 text-sm leading-6 text-red-700">
                {dress.rejectionReason}
              </p>
              <p className="mt-2 text-xs text-red-600">
                הגרסה המאושרת הנוכחית (זו שהציבור רואה) לא נפגעה.
              </p>
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}

export default function MyDressDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [dress, setDress] = useState<Dress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    setCheckingAuth(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (checkingAuth) {
      return;
    }

    async function load() {
      const token = getToken();

      if (!token) {
        router.push("/login");
        return;
      }

      const id = Number(params.id);

      if (!Number.isFinite(id)) {
        setError("השמלה לא נמצאה.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        // Ownership is enforced server-side: getMyDresses only ever returns
        // the current user's own dresses, so a foreign/nonexistent id simply
        // won't be found here - there is no separate permission check needed.
        const myDresses = await getMyDresses(token);
        const found = myDresses.find((current) => current.id === id);

        if (!found) {
          setError("השמלה לא נמצאה, או שאינה שייכת לך.");
          return;
        }

        setDress(found);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.push("/login");
          return;
        }

        setError("לא הצלחנו לטעון את פרטי השמלה. נסי שוב.");
      } finally {
        setLoading(false);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth, params.id]);

  if (checkingAuth) {
    return null;
  }

  // "מידות ומחירים" below reflects exactly what's currently live/public -
  // pending (ADD/REMOVE-flagged) rows from an in-progress or submitted edit
  // are reviewed on the edit page instead, not mixed into this factual list.
  const liveSizes = dress
    ? dress.sizes.filter((size) => size.pendingAction === null)
    : [];
  const liveOrPendingRemovalSizes = dress
    ? dress.sizes.filter((size) => size.pendingAction !== "ADD")
    : [];
  const photos = dress
    ? [...dress.photos]
        .filter((photo) => photo.pendingAction === null)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const activePhoto = photos[activePhotoIndex];

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <Link
          href="/dresses"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition hover:text-rose-500"
        >
          → חזרה לשמלות שלי
        </Link>

        {loading ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="h-[480px] animate-pulse rounded-[2rem] bg-zinc-200" />
            <div className="space-y-4">
              <div className="h-8 w-2/3 animate-pulse rounded bg-zinc-200" />
              <div className="h-5 w-1/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-24 w-full animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[2rem] border border-dashed border-zinc-300 bg-white px-6 py-20 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-4xl">
              👗
            </div>

            <h1 className="mt-6 text-2xl font-black text-zinc-900">
              {error}
            </h1>

            <Link
              href="/dresses"
              className="mt-7 inline-flex rounded-full bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
            >
              חזרה לשמלות שלי
            </Link>
          </div>
        ) : dress ? (
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Photos */}
            <div>
              <div className="relative h-[480px] overflow-hidden rounded-[2rem] bg-zinc-100 shadow-sm ring-1 ring-zinc-200/60">
                {activePhoto ? (
                  <img
                    src={getDressImageUrl(activePhoto)}
                    alt={dress.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-rose-50 via-zinc-50 to-purple-50 text-8xl">
                    👗
                  </div>
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
                          ? "ring-rose-400"
                          : "ring-transparent hover:ring-zinc-200"
                      }`}
                    >
                      <img
                        src={getDressImageUrl(photo)}
                        alt={`${dress.name} ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div>
              <p className="text-sm font-medium text-rose-500">
                {dress.category || "ללא קטגוריה"}
                {dress.color && ` · ${dress.color}`}
              </p>

              <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-900">
                {dress.name}
              </h1>

              {dress.description && (
                <p className="mt-5 text-base leading-7 text-zinc-600">
                  {dress.description}
                </p>
              )}

              <StatusPanel dress={dress} />

              <div className="mt-8 rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
                <h2 className="text-lg font-bold text-zinc-900">
                  מידות ומחירים
                </h2>

                {liveSizes.length > 0 ? (
                  <ul className="mt-4 divide-y divide-zinc-100">
                    {liveSizes.map((size) => (
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

              {dress.status === "APPROVED" && (
                <DressAvailabilityManager
                  dressId={dress.id}
                  sizes={liveOrPendingRemovalSizes}
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
