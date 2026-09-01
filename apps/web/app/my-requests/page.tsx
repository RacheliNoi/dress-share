"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, logout } from "@/lib/auth";
import {
  ApiError,
  BookingStatus,
  BookingWithDress,
  getDressImageUrl,
  getMyBookingsAsRenter,
} from "@/lib/api";
import Header from "@/components/Header";
import DressPlaceholder from "@/components/ui/DressPlaceholder";
import BookingChat from "@/components/BookingChat";

const STATUS_BADGES: Partial<Record<BookingStatus, { label: string; className: string }>> = {
  INTERESTED: { label: "מישהו מתעניין", className: "bg-warning-soft text-warning" },
  RENTED: { label: "מושכר", className: "bg-accent-soft text-accent-deep" },
  CANCELLED: { label: "בוטל", className: "bg-zinc-100 text-zinc-500" },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export default function MyRequestsPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<BookingWithDress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [failedImageIds, setFailedImageIds] = useState<Set<number>>(new Set());
  const [openChatId, setOpenChatId] = useState<number | null>(null);

  async function loadBookings() {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await getMyBookingsAsRenter(token);
      setBookings(data);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        logout();
        router.push("/login");
        return;
      }

      setError("לא הצלחנו לטעון את הבקשות שלך. נסי שוב.");
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
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checkingAuth) {
    return null;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <section className="mb-7">
          <p className="mb-2 text-sm font-medium text-accent">כשוכרת</p>

          <h1 className="text-3xl font-black tracking-tight text-zinc-900">
            הבקשות שלי
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            כל ההתעניינויות וההשכרות שסימנת, במקום אחד.
          </p>
        </section>

        {error && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-error-soft bg-error-soft px-5 py-4 text-sm text-error">
            <span>{error}</span>

            <button
              type="button"
              onClick={loadBookings}
              className="font-bold underline underline-offset-4"
            >
              נסי שוב
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="flex gap-4 overflow-hidden rounded-[20px] bg-white p-4 shadow-sm ring-1 ring-zinc-200/60"
              >
                <div className="h-24 w-24 shrink-0 animate-pulse rounded-2xl bg-zinc-200" />
                <div className="flex-1 space-y-3 py-1">
                  <div className="h-5 w-1/3 animate-pulse rounded bg-zinc-200" />
                  <div className="h-4 w-1/4 animate-pulse rounded bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-20 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-4xl">
              👗
            </div>

            <h2 className="mt-6 text-2xl font-black text-zinc-900">
              עדיין לא סימנת עניין באף שמלה
            </h2>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
              עברי על הקטלוג ולחצי על &quot;מעוניינת בהשכרה&quot; בשמלה שאהבת.
            </p>

            <Link
              href="/"
              className="mt-7 inline-flex rounded-full bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
            >
              לצפייה בקטלוג
            </Link>
          </section>
        ) : (
          <ul className="space-y-4">
            {bookings.map((booking) => {
              const photo = booking.dress.photos[0];
              const showImage = Boolean(photo) && !failedImageIds.has(booking.dress.id);
              const badge = STATUS_BADGES[booking.status] ?? {
                label: booking.status,
                className: "bg-zinc-100 text-zinc-500",
              };

              const isChatOpen = openChatId === booking.id;

              return (
                <li
                  key={booking.id}
                  className="overflow-hidden rounded-[20px] bg-white shadow-sm ring-1 ring-zinc-200/60"
                >
                  <div className="flex gap-4 p-4">
                    <Link
                      href={`/dress/${booking.dress.id}`}
                      className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-zinc-100 transition hover:opacity-90"
                    >
                      {showImage && photo ? (
                        <img
                          src={getDressImageUrl(photo)}
                          alt={booking.dress.name}
                          onError={() =>
                            setFailedImageIds((current) => new Set(current).add(booking.dress.id))
                          }
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <DressPlaceholder size="md" />
                      )}
                    </Link>

                    <div className="min-w-0 flex-1 py-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {booking.size && (
                          <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                            מידה {booking.size}
                          </span>
                        )}
                      </div>

                      <Link href={`/dress/${booking.dress.id}`}>
                        <h3 className="font-display mt-2 text-lg font-semibold text-zinc-900 transition hover:text-accent">
                          {booking.dress.name}
                        </h3>
                      </Link>

                      {/* dir="ltr" pins the digit order - see the same
                          note on DressAvailabilityManager's date range. */}
                      <p dir="ltr" className="mt-1 text-right text-sm font-semibold text-zinc-500">
                        {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
                      </p>

                      <button
                        type="button"
                        onClick={() => setOpenChatId(isChatOpen ? null : booking.id)}
                        className="mt-2 text-xs font-bold text-accent underline underline-offset-4"
                      >
                        {isChatOpen ? "סגירת הצ'אט" : "צ'אט עם בעלת השמלה"}
                      </button>
                    </div>
                  </div>

                  {isChatOpen && (
                    <div className="border-t border-zinc-100 p-4">
                      <BookingChat bookingId={booking.id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
