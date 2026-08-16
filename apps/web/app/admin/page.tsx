"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";
import {
  ApiError,
  PendingDress,
  approveDress,
  getDressImageUrl,
  getPendingDresses,
  rejectDress,
} from "@/lib/api";
import Header from "@/components/Header";

export default function AdminDashboardPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [dresses, setDresses] = useState<PendingDress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState<number | null>(null);

  async function loadPending() {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await getPendingDresses(token);
      setDresses(data);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.push("/");
        return;
      }

      setError("לא הצלחנו לטעון את השמלות הממתינות. נסי שוב.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = getToken();
    const user = getUser();

    if (!token || !user) {
      router.push("/login");
      return;
    }

    if (user.role !== "ADMIN") {
      router.push("/");
      return;
    }

    setCheckingAuth(false);
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checkingAuth) {
    return null;
  }

  async function handleApprove(id: number) {
    const token = getToken();
    if (!token) return;

    setActioningId(id);

    try {
      await approveDress(token, id);
      setDresses((current) => current.filter((dress) => dress.id !== id));
    } catch {
      setError("שגיאה באישור השמלה. נסי שוב.");
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(id: number) {
    const token = getToken();
    if (!token) return;

    setActioningId(id);

    try {
      await rejectDress(token, id);
      setDresses((current) => current.filter((dress) => dress.id !== id));
    } catch {
      setError("שגיאה בדחיית השמלה. נסי שוב.");
    } finally {
      setActioningId(null);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        <section className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-rose-500">
              אזור ניהול
            </p>

            <h1 className="text-3xl font-black tracking-tight text-zinc-900">
              שמלות הממתינות לאישור
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              בדקי את פרטי השמלה ותמונותיה, ואשרי או דחי אותה.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-zinc-200/70">
            <span className="font-bold text-zinc-900">{dresses.length}</span>
            <span className="text-zinc-500">ממתינות</span>
          </div>
        </section>

        {error && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
            <span>{error}</span>

            <button
              type="button"
              onClick={loadPending}
              className="font-bold underline underline-offset-4"
            >
              נסי שוב
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {[1, 2].map((item) => (
              <div
                key={item}
                className="h-64 animate-pulse rounded-[1.75rem] bg-white shadow-sm ring-1 ring-zinc-200/60"
              />
            ))}
          </div>
        ) : dresses.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-zinc-300 bg-white px-6 py-20 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-4xl">
              ✨
            </div>

            <h2 className="mt-6 text-2xl font-black text-zinc-900">
              אין שמלות הממתינות לאישור
            </h2>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
              כשמשתמשות ישלחו שמלות חדשות לאישור, הן יופיעו כאן.
            </p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {dresses.map((dress) => {
              const photo = [...dress.photos].sort(
                (a, b) => a.sortOrder - b.sortOrder,
              )[0];
              const imageUrl = photo ? getDressImageUrl(photo) : null;

              return (
                <article
                  key={dress.id}
                  className="overflow-hidden rounded-[1.75rem] bg-white shadow-sm ring-1 ring-zinc-200/60"
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className="relative h-56 w-full shrink-0 overflow-hidden bg-zinc-100 sm:h-auto sm:w-48">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={dress.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-rose-50 via-zinc-50 to-purple-50 text-5xl">
                          👗
                        </div>
                      )}

                      {dress.photos.length > 1 && (
                        <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                          📷 {dress.photos.length}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 p-5">
                      <h3 className="text-lg font-black text-zinc-900">
                        {dress.name}
                      </h3>

                      <p className="mt-1 text-sm text-zinc-500">
                        {dress.category || "ללא קטגוריה"}
                        {dress.color && ` · ${dress.color}`}
                      </p>

                      <p className="mt-1 text-xs text-zinc-400">
                        נשלחה על ידי {dress.owner.name || dress.owner.email}
                      </p>

                      {dress.description && (
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-600">
                          {dress.description}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {dress.sizes.length > 0 ? (
                          dress.sizes.map((size) => (
                            <span
                              key={size.id}
                              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600"
                            >
                              מידה {size.size} · {size.price} ₪
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-zinc-400">
                            טרם הוגדרו מידות
                          </span>
                        )}
                      </div>

                      <div className="mt-5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(dress.id)}
                          disabled={actioningId === dress.id}
                          className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {actioningId === dress.id ? "מעדכנת..." : "אישור"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReject(dress.id)}
                          disabled={actioningId === dress.id}
                          className="flex-1 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {actioningId === dress.id ? "מעדכנת..." : "דחייה"}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
