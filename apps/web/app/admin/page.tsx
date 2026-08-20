"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";
import {
  ApiError,
  PendingDress,
  approveDress,
  getPendingDresses,
  rejectDress,
} from "@/lib/api";
import Header from "@/components/Header";
import PhotoGallery from "@/components/PhotoGallery";

export default function AdminDashboardPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [dresses, setDresses] = useState<PendingDress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

  function openRejectForm(id: number) {
    setRejectingId(id);
    setRejectReason("");
  }

  function cancelRejectForm() {
    setRejectingId(null);
    setRejectReason("");
  }

  async function handleConfirmReject(id: number) {
    const token = getToken();
    const reason = rejectReason.trim();

    if (!token || !reason) {
      return;
    }

    setActioningId(id);

    try {
      await rejectDress(token, id, reason);
      setDresses((current) => current.filter((dress) => dress.id !== id));
      setRejectingId(null);
      setRejectReason("");
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
              // A card is either a brand-new dress submission (status
              // PENDING_APPROVAL) or an edit to an already-approved dress
              // (status stays APPROVED, pendingReviewSubmittedAt is set) -
              // both share the same approve/reject actions below, but an
              // edit also gets a before/after comparison so the admin isn't
              // just told "here's a name", they can see what's changing.
              const isEdit = dress.status === "APPROVED";
              const liveSizes = dress.sizes.filter(
                (size) => size.pendingAction === null,
              );
              const addedSizes = dress.sizes.filter(
                (size) => size.pendingAction === "ADD",
              );
              const removedSizes = dress.sizes.filter(
                (size) => size.pendingAction === "REMOVE",
              );
              const addedPhotos = dress.photos.filter(
                (photo) => photo.pendingAction === "ADD",
              );
              const removedPhotos = dress.photos.filter(
                (photo) => photo.pendingAction === "REMOVE",
              );
              const pending = dress.pendingDetails;
              const changedFields = isEdit && pending
                ? (
                    [
                      pending.name !== undefined && pending.name !== dress.name
                        ? { label: "שם", from: dress.name, to: pending.name }
                        : null,
                      pending.description !== undefined &&
                      pending.description !== dress.description
                        ? {
                            label: "תיאור",
                            from: dress.description || "—",
                            to: pending.description || "—",
                          }
                        : null,
                      pending.category !== undefined &&
                      pending.category !== dress.category
                        ? {
                            label: "קטגוריה",
                            from: dress.category || "—",
                            to: pending.category || "—",
                          }
                        : null,
                      pending.color !== undefined && pending.color !== dress.color
                        ? { label: "צבע", from: dress.color || "—", to: pending.color || "—" }
                        : null,
                    ] as const
                  ).filter((field): field is NonNullable<typeof field> => field !== null)
                : [];

              return (
                <article
                  key={dress.id}
                  className="overflow-hidden rounded-[1.75rem] bg-white shadow-sm ring-1 ring-zinc-200/60"
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className="shrink-0 p-3 sm:w-56">
                      <PhotoGallery
                        photos={dress.photos.filter((photo) => photo.pendingAction !== "REMOVE")}
                        alt={dress.name}
                      />
                    </div>

                    <div className="flex-1 p-5">
                      {isEdit && (
                        <span className="mb-2 inline-flex rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold text-sky-700">
                          עריכה לשמלה קיימת ומאושרת
                        </span>
                      )}

                      <h3 className="text-lg font-black text-zinc-900">
                        {dress.name}
                      </h3>

                      <p className="mt-1 text-sm text-zinc-500">
                        {dress.category || "ללא קטגוריה"}
                        {dress.color && ` · ${dress.color}`}
                      </p>

                      <p className="mt-1 text-xs text-zinc-400">
                        {isEdit ? "עריכה נשלחה על ידי" : "נשלחה על ידי"}{" "}
                        {dress.owner.name || dress.owner.email}
                      </p>

                      {dress.description && (
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-600">
                          {dress.description}
                        </p>
                      )}

                      {changedFields.length > 0 && (
                        <div className="mt-3 space-y-1.5 rounded-xl bg-sky-50/60 p-3">
                          {changedFields.map((field) => (
                            <p key={field.label} className="text-xs text-sky-800">
                              <span className="font-bold">{field.label}:</span>{" "}
                              <span className="text-zinc-500 line-through">{field.from}</span>
                              {" ← "}
                              <span className="font-bold">{field.to}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {liveSizes.length > 0 || addedSizes.length > 0 || removedSizes.length > 0 ? (
                          <>
                            {liveSizes.map((size) => (
                              <span
                                key={size.id}
                                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600"
                              >
                                מידה {size.size} · {size.price} ₪ · {size.quantity} יחידות
                              </span>
                            ))}
                            {addedSizes.map((size) => (
                              <span
                                key={size.id}
                                className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                              >
                                + מידה {size.size} · {size.price} ₪ · {size.quantity} יחידות
                              </span>
                            ))}
                            {removedSizes.map((size) => (
                              <span
                                key={size.id}
                                className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 line-through"
                              >
                                מידה {size.size} · {size.price} ₪ · {size.quantity} יחידות
                              </span>
                            ))}
                          </>
                        ) : (
                          <span className="text-xs text-zinc-400">
                            טרם הוגדרו מידות
                          </span>
                        )}
                      </div>

                      {(addedPhotos.length > 0 || removedPhotos.length > 0) && (
                        <p className="mt-2 text-xs text-zinc-500">
                          {addedPhotos.length > 0 &&
                            `${addedPhotos.length} תמונות חדשות מוצעות`}
                          {addedPhotos.length > 0 && removedPhotos.length > 0 && " · "}
                          {removedPhotos.length > 0 &&
                            `${removedPhotos.length} תמונות מסומנות להסרה`}
                        </p>
                      )}

                      {rejectingId === dress.id ? (
                        <div className="mt-5 rounded-xl border border-red-200 bg-red-50/50 p-3">
                          <label className="block text-xs font-bold text-red-700">
                            סיבת הדחייה (חובה)
                          </label>

                          <textarea
                            value={rejectReason}
                            onChange={(event) =>
                              setRejectReason(event.target.value)
                            }
                            placeholder="למשל: התמונות לא ברורות, חסרים פרטים..."
                            rows={3}
                            autoFocus
                            className="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-red-400"
                          />

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirmReject(dress.id)}
                              disabled={
                                actioningId === dress.id ||
                                !rejectReason.trim()
                              }
                              className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {actioningId === dress.id
                                ? "דוחה..."
                                : "אישור הדחייה"}
                            </button>

                            <button
                              type="button"
                              onClick={cancelRejectForm}
                              disabled={actioningId === dress.id}
                              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
                      ) : (
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
                            onClick={() => openRejectForm(dress.id)}
                            disabled={actioningId === dress.id}
                            className="flex-1 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            דחייה
                          </button>
                        </div>
                      )}
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
