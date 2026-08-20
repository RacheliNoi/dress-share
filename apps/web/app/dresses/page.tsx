"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, logout } from "@/lib/auth";
import {
  ApiError,
  Dress,
  DressStatus,
  getDressImageUrl,
  getMyDresses,
} from "@/lib/api";
import Header from "@/components/Header";
import DressPlaceholder from "@/components/ui/DressPlaceholder";

const statusConfig: Record<DressStatus, { label: string; className: string }> = {
DRAFT: {
label: "טיוטה",
className: "bg-surface-sunken text-ink-soft",
},
AI_PROCESSING: {
label: "בעיבוד",
className: "bg-sky-50 text-sky-700",
},
AI_READY: {
label: "מוכנה לבדיקה",
className: "bg-sky-50 text-sky-700",
},
OWNER_REVIEW: {
label: "ממתינה לבדיקתך",
className: "bg-warning-soft text-warning",
},
PENDING_APPROVAL: {
label: "ממתינה לאישור",
className: "bg-warning-soft text-warning",
},
APPROVED: {
label: "מאושרת",
className: "bg-success-soft text-success",
},
REJECTED: {
label: "נדחתה",
className: "bg-error-soft text-error",
},
};

export default function DressesPage() {
const router = useRouter();

const [dresses, setDresses] = useState<Dress[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [checkingAuth, setCheckingAuth] = useState(true);
const [failedImageIds, setFailedImageIds] = useState<Set<number>>(new Set());

async function loadDresses() {
const token = getToken();

if (!token) {
  router.push("/login");
  return;
}

try {
setLoading(true);
setError("");

  const data = await getMyDresses(token);
  setDresses(data);
} catch (err) {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    logout();
    router.push("/login");
    return;
  }

  setError("לא הצלחנו לטעון את השמלות. נסי שוב.");
} finally {
  setLoading(false);
}

}

useEffect(() => {
if (!getToken()) {
  router.push("/login");
  return;
}

setCheckingAuth(false);
loadDresses();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

if (checkingAuth) {
  return null;
}

function getImageUrl(dress: Dress) {
const photo = [...dress.photos].sort(
(a, b) => a.sortOrder - b.sortOrder,
)[0];

if (!photo) return null;

return getDressImageUrl(photo);

}

function getPriceRange(dress: Dress) {
if (dress.sizes.length === 0) {
return "טרם הוגדר מחיר";
}

const prices = dress.sizes.map((size) => size.price);
const min = Math.min(...prices);
const max = Math.max(...prices);

if (min === max) {
  return `${min} ₪`;
}

return `${min}–${max} ₪`;

}

return (<main
    dir="rtl"
   className="min-h-screen bg-[#faf9f7] text-zinc-900"
 >
{/* Top navigation */} <Header />

  <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
    {/* Hero */}
    <section className="relative mb-10 overflow-hidden rounded-[28px] bg-zinc-900 px-7 py-10 text-white shadow-xl sm:px-10 lg:px-14 lg:py-14">
      <div className="relative z-10 max-w-2xl">
        <div className="mb-4 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur">
          ✦ ניהול השמלות שלך
        </div>

        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          השמלות שלך,
          <br />
          <span className="text-accent-light">הסיפור שלהן.</span>
        </h1>

        <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
          הוסיפי שמלות להשכרה, הגדירי מידות ומחירים,
          ושמרי על כל הארון שלך מסודר במקום אחד.
        </p>

        <a
          href="/dresses/new"
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-zinc-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-accent-soft"
        >
          <span className="text-lg">+</span>
          הוספת שמלה חדשה
        </a>
      </div>

      <div className="pointer-events-none absolute -left-20 -top-32 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-1/3 h-96 w-96 rounded-full bg-purple-400/10 blur-3xl" />

      <div className="pointer-events-none absolute bottom-0 left-8 hidden opacity-10 lg:block">
        <svg
          width="260"
          height="260"
          viewBox="0 0 260 260"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="130"
            cy="130"
            r="112"
            stroke="white"
            strokeWidth="1"
          />
          <circle
            cx="130"
            cy="130"
            r="82"
            stroke="white"
            strokeWidth="1"
          />
          <circle
            cx="130"
            cy="130"
            r="52"
            stroke="white"
            strokeWidth="1"
          />
        </svg>
      </div>
    </section>

    {/* Header */}
    <section className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-sm font-medium text-accent">
          הארון שלך
        </p>

        <h2 className="text-3xl font-black tracking-tight text-zinc-900">
          השמלות שלי
        </h2>

        <p className="mt-2 text-sm text-zinc-500">
          כאן תוכלי לנהל את כל השמלות שהעלית להשכרה.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-zinc-200/70">
        <span className="font-bold text-zinc-900">
          {dresses.length}
        </span>
        <span className="text-zinc-500">שמלות</span>
      </div>
    </section>

    {/* Error */}
    {error && (
      <div className="mb-6 flex items-center justify-between rounded-2xl border border-error-soft bg-error-soft px-5 py-4 text-sm text-error">
        <span>{error}</span>

        <button
          type="button"
          onClick={loadDresses}
          className="font-bold underline underline-offset-4"
        >
          נסי שוב
        </button>
      </div>
    )}

    {/* Loading */}
    {loading ? (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="overflow-hidden rounded-[20px] bg-white shadow-sm ring-1 ring-zinc-200/60"
          >
            <div className="h-80 animate-pulse bg-zinc-200" />

            <div className="space-y-3 p-5">
              <div className="h-5 w-2/3 animate-pulse rounded bg-zinc-200" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-8 w-1/2 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    ) : dresses.length === 0 ? (
      /* Empty state */
      <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-20 text-center shadow-sm">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-4xl">
          👗
        </div>

        <h3 className="mt-6 text-2xl font-black text-zinc-900">
          עדיין אין לך שמלות
        </h3>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
          העלי את השמלה הראשונה שלך והתחילי לבנות את אוסף
          השמלות שלך.
        </p>

        <a
          href="/dresses/new"
          className="mt-7 inline-flex rounded-full bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
        >
          + הוספת שמלה ראשונה
        </a>
      </section>
    ) : (
      /* Dress grid */
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {dresses.map((dress) => {
          const imageUrl = getImageUrl(dress);
          const showImage = Boolean(imageUrl) && !failedImageIds.has(dress.id);
          const status = statusConfig[dress.status];

          return (
            <Link
              key={dress.id}
              href={`/dresses/${dress.id}`}
              className="group block overflow-hidden rounded-[20px] bg-white shadow-sm ring-1 ring-zinc-200/60 transition duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              {/* Image */}
              <div className="relative h-[380px] overflow-hidden bg-zinc-100">
                {showImage ? (
                  <img
                    src={imageUrl ?? undefined}
                    alt={dress.name}
                    onError={() =>
                      setFailedImageIds((current) => new Set(current).add(dress.id))
                    }
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />
                ) : (
                  <DressPlaceholder size="lg" />
                )}

                <div className="absolute right-4 top-4">
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>

                {dress.photos.length > 1 && (
                  <div className="absolute bottom-4 left-4 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
                    📷 {dress.photos.length} תמונות
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-zinc-900">
                      {dress.name}
                    </h3>

                    <p className="mt-1 text-sm text-zinc-500">
                      {dress.category || "ללא קטגוריה"}
                      {dress.color && ` · ${dress.color}`}
                    </p>
                  </div>

                  {dress.sizes.length > 0 && (
                    <div className="text-left">
                      <p className="text-xs text-zinc-400">
                        מחיר
                      </p>
                      {/* dir="ltr" pins the digit order - without it, the
                          Unicode bidi algorithm can visually swap a min/max
                          price range around the "–" inside this RTL page,
                          even though the underlying text is already correct. */}
                      <p dir="ltr" className="mt-0.5 whitespace-nowrap text-sm font-black text-zinc-900">
                        {getPriceRange(dress)}
                      </p>
                    </div>
                  )}
                </div>

                {dress.description && (
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-zinc-500">
                    {dress.description}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  {dress.sizes.length > 0 ? (
                    dress.sizes.map((size) => (
                      <span
                        key={size.id}
                        className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600"
                      >
                        {size.size}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-400">
                      טרם הוגדרו מידות
                    </span>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 text-sm font-bold text-zinc-700 transition group-hover:text-accent">
                  <span>צפייה בשמלה</span>
                  <span aria-hidden>←</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    )}
  </div>
</main>

);
}
