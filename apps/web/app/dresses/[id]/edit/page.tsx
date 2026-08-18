"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import {
  ApiError,
  Dress,
  addDressPhotos,
  addDressSize,
  cancelPendingDressEdit,
  cancelPendingPhotoChange,
  cancelPendingSizeChange,
  deleteDressPhoto,
  deleteDressSize,
  getDressImageUrl,
  getMyDresses,
  submitDressEditForApproval,
  submitDressForApproval,
  updateDress,
  updateDressSize,
} from "@/lib/api";
import Header from "@/components/Header";

export default function EditDressPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dress, setDress] = useState<Dress | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [sizeDrafts, setSizeDrafts] = useState<
    Record<number, { size: string; price: string }>
  >({});
  const [savingSizeId, setSavingSizeId] = useState<number | null>(null);
  const [removingSizeId, setRemovingSizeId] = useState<number | null>(null);
  const [sizeActionError, setSizeActionError] = useState("");
  const [sizeActionWarning, setSizeActionWarning] = useState("");

  const [newSizeValue, setNewSizeValue] = useState("");
  const [newPriceValue, setNewPriceValue] = useState("");
  const [addingSize, setAddingSize] = useState(false);
  const [addSizeError, setAddSizeError] = useState("");

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedPreviews, setSelectedPreviews] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState<number | null>(null);

  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState("");

  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [submitEditError, setSubmitEditError] = useState("");
  const [cancellingEdit, setCancellingEdit] = useState(false);
  const [cancelEditError, setCancelEditError] = useState("");

  const isApprovedEdit = dress?.status === "APPROVED";

  async function loadDress() {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const id = Number(params.id);

    if (!Number.isFinite(id)) {
      setLoadError("השמלה לא נמצאה.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadError("");

      // Ownership is enforced server-side: getMyDresses only ever returns
      // the current user's own dresses, so a foreign/nonexistent id simply
      // won't be found here - there is no separate permission check needed.
      const myDresses = await getMyDresses(token);
      const found = myDresses.find((current) => current.id === id);

      if (!found) {
        setLoadError("השמלה לא נמצאה, או שאינה שייכת לך.");
        return;
      }

      if (found.status === "APPROVED" && found.pendingReviewSubmittedAt) {
        setLoadError(
          "העריכה שלך כבר נשלחה לאישור מנהל - יש להמתין להחלטה לפני עריכה נוספת.",
        );
        return;
      }

      setDress(found);

      // While an approved dress is being edited, the public catalog keeps
      // showing the live values - the form here is prefilled from any
      // already-in-progress pending draft instead, so returning to this
      // page never loses what was already proposed.
      const pending = found.pendingDetails;
      setName(pending?.name ?? found.name);
      setDescription((pending?.description ?? found.description) ?? "");
      setCategory((pending?.category ?? found.category) ?? "");
      setColor((pending?.color ?? found.color) ?? "");
      setSizeDrafts(
        Object.fromEntries(
          found.sizes.map((size) => [
            size.id,
            { size: size.size, price: String(size.price) },
          ]),
        ),
      );
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.push("/login");
        return;
      }

      setLoadError("לא הצלחנו לטעון את פרטי השמלה. נסי שוב.");
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
    loadDress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checkingAuth) {
    return null;
  }

  async function handleSaveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();

    if (!token || !dress) {
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const updated = await updateDress(token, dress.id, {
        name,
        description: description || undefined,
        category: category || undefined,
        color: color || undefined,
      });

      setDress(updated);
      setSaveSuccess(
        isApprovedEdit
          ? "השינויים נשמרו כטיוטה. הם יופיעו בקטלוג רק לאחר אישור מנהל."
          : "הפרטים נשמרו בהצלחה.",
      );
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "שגיאה בשמירת הפרטים",
      );
    } finally {
      setSaving(false);
    }
  }

  // Sizes and photos each have their own immediate, atomic save action (like
  // the New Dress flow), so by the time the user reaches the final resubmit
  // button every size/photo change is already persisted server-side.
  async function refreshDressAndSizeDrafts(token: string, dressId: number) {
    const myDresses = await getMyDresses(token);
    const updated = myDresses.find((current) => current.id === dressId);

    if (updated) {
      setDress(updated);
      setSizeDrafts(
        Object.fromEntries(
          updated.sizes.map((size) => [
            size.id,
            { size: size.size, price: String(size.price) },
          ]),
        ),
      );
    }

    return updated;
  }

  async function handleAddSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    const price = Number(newPriceValue);

    if (!token || !dress || !newSizeValue.trim() || !price) {
      return;
    }

    setAddingSize(true);
    setAddSizeError("");

    try {
      await addDressSize(token, dress.id, {
        size: newSizeValue.trim(),
        price,
      });

      await refreshDressAndSizeDrafts(token, dress.id);
      setNewSizeValue("");
      setNewPriceValue("");
    } catch (err) {
      setAddSizeError(
        err instanceof ApiError ? err.message : "שגיאה בהוספת המידה",
      );
    } finally {
      setAddingSize(false);
    }
  }

  async function handleUpdateSize(sizeId: number) {
    const token = getToken();
    const draft = sizeDrafts[sizeId];
    const price = Number(draft?.price);

    if (!token || !dress || !draft || !draft.size.trim() || !price) {
      return;
    }

    setSavingSizeId(sizeId);
    setSizeActionError("");
    setSizeActionWarning("");

    try {
      const result = await updateDressSize(token, dress.id, sizeId, {
        size: draft.size.trim(),
        price,
      });

      if (result.hasActiveBookings) {
        setSizeActionWarning(
          `יש הזמנות פעילות במידה ${draft.size.trim()} - הן ימשיכו להתקיים כפי שהן; המידה הקודמת פשוט לא תהיה זמינה להזמנות חדשות לאחר אישור העריכה.`,
        );
      }

      await refreshDressAndSizeDrafts(token, dress.id);
    } catch (err) {
      setSizeActionError(
        err instanceof ApiError ? err.message : "שגיאה בעדכון המידה",
      );
    } finally {
      setSavingSizeId(null);
    }
  }

  async function handleRemoveSize(sizeId: number) {
    const token = getToken();

    if (!token || !dress) {
      return;
    }

    const confirmed = window.confirm("להסיר את המידה?");

    if (!confirmed) {
      return;
    }

    setRemovingSizeId(sizeId);
    setSizeActionError("");
    setSizeActionWarning("");

    try {
      const result = await deleteDressSize(token, dress.id, sizeId);

      if (result.hasActiveBookings) {
        setSizeActionWarning(
          "יש הזמנות פעילות במידה זו - הן ימשיכו להתקיים כפי שהן, אך לא ניתן יהיה ליצור הזמנות חדשות במידה זו לאחר אישור העריכה.",
        );
      }

      await refreshDressAndSizeDrafts(token, dress.id);
    } catch (err) {
      setSizeActionError(
        err instanceof ApiError ? err.message : "שגיאה בהסרת המידה",
      );
    } finally {
      setRemovingSizeId(null);
    }
  }

  async function handleCancelSizeChange(sizeId: number) {
    const token = getToken();

    if (!token || !dress) {
      return;
    }

    setRemovingSizeId(sizeId);
    setSizeActionError("");

    try {
      await cancelPendingSizeChange(token, dress.id, sizeId);
      await refreshDressAndSizeDrafts(token, dress.id);
    } catch (err) {
      setSizeActionError(
        err instanceof ApiError ? err.message : "שגיאה בביטול השינוי",
      );
    } finally {
      setRemovingSizeId(null);
    }
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    setSelectedFiles(files);

    setSelectedPreviews((current) => {
      current.forEach((url) => URL.revokeObjectURL(url));
      return files.map((file) => URL.createObjectURL(file));
    });
  }

  async function handleUploadPhotos() {
    const token = getToken();

    if (!token || !dress || selectedFiles.length === 0) {
      return;
    }

    setUploadingPhotos(true);
    setPhotoError("");

    try {
      await addDressPhotos(token, dress.id, selectedFiles);

      const myDresses = await getMyDresses(token);
      const updated = myDresses.find((current) => current.id === dress.id);

      if (updated) {
        setDress(updated);
      }

      setSelectedFiles([]);

      setSelectedPreviews((current) => {
        current.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });

      const fileInput = document.getElementById(
        "dress-photos",
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }
    } catch (err) {
      setPhotoError(
        err instanceof ApiError ? err.message : "שגיאה בהעלאת התמונות",
      );
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function handleDeletePhoto(photoId: number) {
    const token = getToken();

    if (!token || !dress) {
      return;
    }

    const confirmed = window.confirm("למחוק את התמונה?");

    if (!confirmed) {
      return;
    }

    setDeletingPhotoId(photoId);
    setPhotoError("");

    try {
      await deleteDressPhoto(token, dress.id, photoId);
      await refreshDressAndSizeDrafts(token, dress.id);
    } catch (err) {
      setPhotoError(
        err instanceof ApiError ? err.message : "שגיאה במחיקת התמונה",
      );
    } finally {
      setDeletingPhotoId(null);
    }
  }

  async function handleCancelPhotoChange(photoId: number) {
    const token = getToken();

    if (!token || !dress) {
      return;
    }

    setDeletingPhotoId(photoId);
    setPhotoError("");

    try {
      await cancelPendingPhotoChange(token, dress.id, photoId);
      await refreshDressAndSizeDrafts(token, dress.id);
    } catch (err) {
      setPhotoError(
        err instanceof ApiError ? err.message : "שגיאה בביטול השינוי",
      );
    } finally {
      setDeletingPhotoId(null);
    }
  }

  async function handleResubmit() {
    const token = getToken();

    if (!token || !dress) {
      return;
    }

    if (!name.trim()) {
      setResubmitError("יש להזין שם לשמלה");
      return;
    }

    setResubmitting(true);
    setResubmitError("");

    try {
      // Sizes and photos are already saved (each has its own immediate
      // action above); the detail fields below are only saved on submit
      // here, so flush them first to make sure nothing on screen is lost.
      await updateDress(token, dress.id, {
        name,
        description: description || undefined,
        category: category || undefined,
        color: color || undefined,
      });

      await submitDressForApproval(token, dress.id);
      router.push("/dresses");
    } catch (err) {
      setResubmitError(
        err instanceof ApiError ? err.message : "שגיאה בשליחה מחדש לאישור",
      );
    } finally {
      setResubmitting(false);
    }
  }

  async function handleSubmitEdit() {
    const token = getToken();

    if (!token || !dress) {
      return;
    }

    setSubmittingEdit(true);
    setSubmitEditError("");

    try {
      // Detail fields (name/description/category/color) are saved live into
      // the pending draft on every "שמירת שינויים" click above, so nothing
      // extra needs flushing here - this just locks in what's already
      // staged and sends it to the admin queue.
      await submitDressEditForApproval(token, dress.id);
      router.push(`/dresses/${dress.id}`);
    } catch (err) {
      setSubmitEditError(
        err instanceof ApiError ? err.message : "שגיאה בשליחת העריכה לאישור",
      );
    } finally {
      setSubmittingEdit(false);
    }
  }

  async function handleCancelEdit() {
    const token = getToken();

    if (!token || !dress) {
      return;
    }

    const confirmed = window.confirm(
      "לבטל את כל השינויים שביצעת ולחזור לגרסה המאושרת הנוכחית?",
    );

    if (!confirmed) {
      return;
    }

    setCancellingEdit(true);
    setCancelEditError("");

    try {
      await cancelPendingDressEdit(token, dress.id);
      router.push(`/dresses/${dress.id}`);
    } catch (err) {
      setCancelEditError(
        err instanceof ApiError ? err.message : "שגיאה בביטול העריכה",
      );
    } finally {
      setCancellingEdit(false);
    }
  }

  const canResubmit = dress?.status === "DRAFT" || dress?.status === "REJECTED";
  const hasPendingChanges = Boolean(
    dress &&
      isApprovedEdit &&
      (dress.pendingDetails != null ||
        dress.sizes.some((size) => size.pendingAction !== null) ||
        dress.photos.some((photo) => photo.pendingAction !== null)),
  );

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 lg:py-14">
        <Link
          href="/dresses"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition hover:text-rose-500"
        >
          → חזרה לשמלות שלי
        </Link>

        <h1 className="text-3xl font-black tracking-tight text-zinc-900">
          {isApprovedEdit ? "עריכת שמלה מאושרת" : "עריכת שמלה"}
        </h1>

        {loading ? (
          <div className="mt-8 space-y-4">
            <div className="h-40 animate-pulse rounded-3xl bg-zinc-200" />
            <div className="h-64 animate-pulse rounded-3xl bg-zinc-100" />
          </div>
        ) : loadError ? (
          <section className="mt-8 rounded-[2rem] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-4xl">
              👗
            </div>

            <h2 className="mt-6 text-xl font-black text-zinc-900">
              {loadError}
            </h2>

            <Link
              href="/dresses"
              className="mt-7 inline-flex rounded-full bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
            >
              חזרה לשמלות שלי
            </Link>
          </section>
        ) : dress ? (
          <div className="mt-8 space-y-6">
            {isApprovedEdit && (
              <section className="rounded-3xl border border-sky-100 bg-sky-50 p-6">
                <p className="text-sm font-bold text-sky-800">
                  את עורכת שמלה שכבר מאושרת ומוצגת בקטלוג
                </p>
                <p className="mt-1 text-sm leading-6 text-sky-800">
                  השינויים שתבצעי כאן נשמרים כטיוטה ולא משפיעים על מה שהציבור
                  רואה. הציבור ימשיך לראות את הגרסה הנוכחית עד שתשלחי את
                  העריכה לאישור מנהל, וזו תאושר בפועל.
                </p>
              </section>
            )}

            {dress.status === "REJECTED" && (
              <section className="rounded-3xl border border-red-100 bg-red-50 p-6">
                <p className="text-sm font-bold text-red-700">
                  השמלה נדחתה על ידי מנהל
                </p>

                <p className="mt-1 text-sm leading-6 text-red-700">
                  {dress.rejectionReason || "לא צוינה סיבה."}
                </p>

                <p className="mt-3 text-xs text-red-600">
                  תקני את הפרטים, המידות והתמונות בהתאם, ולאחר מכן שלחי מחדש
                  לאישור.
                </p>
              </section>
            )}

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
              <h2 className="text-lg font-bold text-zinc-900">
                1. פרטי השמלה
              </h2>

              <form
                onSubmit={handleSaveDetails}
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="שם השמלה"
                  required
                  className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500 md:col-span-2"
                />

                <input
                  type="text"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="קטגוריה (למשל: ערב)"
                  className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
                />

                <input
                  type="text"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  placeholder="צבע"
                  className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
                />

                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="תיאור השמלה"
                  rows={4}
                  className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500 md:col-span-2"
                />

                {saveError && (
                  <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 md:col-span-2">
                    {saveError}
                  </div>
                )}

                {saveSuccess && (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700 md:col-span-2">
                    {saveSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="rounded-xl bg-zinc-900 px-4 py-3 font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
                >
                  {saving ? "שומרת..." : "שמירת שינויים"}
                </button>
              </form>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
              <h2 className="text-lg font-bold text-zinc-900">
                2. מידות ומחירים
              </h2>

              {dress.sizes.length > 0 && (
                <div className="mt-5 space-y-2">
                  {dress.sizes.map((size) => {
                    const draft = sizeDrafts[size.id] ?? {
                      size: size.size,
                      price: String(size.price),
                    };

                    if (size.pendingAction === "REMOVE") {
                      return (
                        <div
                          key={size.id}
                          className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-red-200 bg-red-50/40 p-3"
                        >
                          <span className="text-sm text-red-700 line-through">
                            מידה {size.size} · {size.price} ₪
                          </span>
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
                            מסומן להסרה
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCancelSizeChange(size.id)}
                            disabled={removingSizeId === size.id}
                            className="mr-auto rounded-lg border border-zinc-300 px-3 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {removingSizeId === size.id ? "מבטלת..." : "בטל הסרה"}
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={size.id}
                        className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${
                          size.pendingAction === "ADD"
                            ? "border-emerald-200 bg-emerald-50/40"
                            : "border-zinc-200"
                        }`}
                      >
                        {size.pendingAction === "ADD" && (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                            חדש - ממתין לאישור
                          </span>
                        )}

                        <input
                          type="text"
                          value={draft.size}
                          onChange={(event) =>
                            setSizeDrafts((current) => ({
                              ...current,
                              [size.id]: { ...draft, size: event.target.value },
                            }))
                          }
                          aria-label="עריכת שם המידה"
                          className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
                        />

                        <input
                          type="number"
                          min={0}
                          value={draft.price}
                          onChange={(event) =>
                            setSizeDrafts((current) => ({
                              ...current,
                              [size.id]: { ...draft, price: event.target.value },
                            }))
                          }
                          aria-label="עריכת מחיר המידה"
                          className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
                        />

                        <span className="text-sm text-zinc-400">₪</span>

                        <button
                          type="button"
                          onClick={() => handleUpdateSize(size.id)}
                          disabled={
                            savingSizeId === size.id ||
                            !draft.size.trim() ||
                            !draft.price
                          }
                          className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingSizeId === size.id ? "מעדכנת..." : "עדכון"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveSize(size.id)}
                          disabled={removingSizeId === size.id}
                          className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {removingSizeId === size.id ? "מסירה..." : "הסרה"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {sizeActionWarning && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  {sizeActionWarning}
                </p>
              )}

              {sizeActionError && (
                <p className="mt-3 text-sm text-red-600">{sizeActionError}</p>
              )}

              <form
                onSubmit={handleAddSize}
                className="mt-4 flex flex-col gap-3 sm:flex-row"
              >
                <input
                  type="text"
                  value={newSizeValue}
                  onChange={(event) => setNewSizeValue(event.target.value)}
                  placeholder="מידה (למשל: M)"
                  className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
                />

                <input
                  type="number"
                  min={0}
                  value={newPriceValue}
                  onChange={(event) => setNewPriceValue(event.target.value)}
                  placeholder="מחיר בש״ח"
                  className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
                />

                <button
                  type="submit"
                  disabled={addingSize || !newSizeValue.trim() || !newPriceValue}
                  className="rounded-xl border border-zinc-300 px-5 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingSize ? "מוסיפה..." : "+ הוספת מידה"}
                </button>
              </form>

              {addSizeError && (
                <p className="mt-3 text-sm text-red-600">{addSizeError}</p>
              )}
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/60 sm:p-7">
              <h2 className="text-lg font-bold text-zinc-900">3. תמונות</h2>

              <p className="mt-1 text-sm text-zinc-500">
                הוסיפי או הסירי תמונות של השמלה.
              </p>

              {dress.photos.length > 0 && (
                <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {dress.photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className={`group relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 ring-1 transition duration-300 hover:shadow-lg ${
                        photo.pendingAction === "REMOVE"
                          ? "opacity-50 ring-red-200"
                          : photo.pendingAction === "ADD"
                            ? "ring-emerald-300"
                            : "ring-zinc-200/70"
                      }`}
                    >
                      <img
                        src={getDressImageUrl(photo)}
                        alt={`תמונה ${index + 1}`}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />

                      {index === 0 && (
                        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-zinc-700 shadow-sm backdrop-blur">
                          ראשית
                        </span>
                      )}

                      {photo.pendingAction === "ADD" && (
                        <span className="absolute bottom-2 right-2 rounded-full bg-emerald-100/95 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shadow-sm backdrop-blur">
                          ממתין לאישור
                        </span>
                      )}

                      {photo.pendingAction === "REMOVE" && (
                        <span className="absolute bottom-2 right-2 rounded-full bg-red-100/95 px-2 py-0.5 text-[10px] font-bold text-red-700 shadow-sm backdrop-blur">
                          מסומן להסרה
                        </span>
                      )}

                      {photo.pendingAction === "REMOVE" ? (
                        <button
                          type="button"
                          onClick={() => handleCancelPhotoChange(photo.id)}
                          disabled={deletingPhotoId === photo.id}
                          aria-label="ביטול הסרה"
                          className="absolute left-2 top-2 flex h-7 items-center justify-center rounded-full bg-zinc-900/70 px-2 text-[10px] font-bold text-white shadow-sm backdrop-blur transition duration-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingPhotoId === photo.id ? "..." : "בטל הסרה"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo.id)}
                          disabled={deletingPhotoId === photo.id}
                          aria-label="מחיקת תמונה"
                          className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/60 text-xs font-bold text-white shadow-sm backdrop-blur transition duration-200 hover:scale-110 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingPhotoId === photo.id ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          ) : (
                            "✕"
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedPreviews.length > 0 && (
                <div className="mt-6">
                  <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    ממתינות להעלאה
                  </p>

                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {selectedPreviews.map((preview, index) => (
                      <div
                        key={preview}
                        className="relative aspect-square overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40"
                      >
                        <img
                          src={preview}
                          alt={`תצוגה מקדימה ${index + 1}`}
                          className="h-full w-full object-cover opacity-90"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dress.photos.length === 0 && selectedPreviews.length === 0 && (
                <div className="mt-6 flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-rose-50 via-zinc-50 to-purple-50 px-6 py-10 text-center">
                  <span className="text-4xl">👗</span>
                  <p className="mt-3 text-sm font-medium text-zinc-600">
                    עדיין לא הועלו תמונות
                  </p>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <label
                  htmlFor="dress-photos"
                  className="group flex flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-3.5 text-sm text-zinc-600 transition duration-200 hover:border-rose-300 hover:bg-rose-50/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-zinc-200 transition duration-200 group-hover:ring-rose-200">
                    📷
                  </span>

                  <span className="flex-1">
                    {selectedFiles.length > 0
                      ? `${selectedFiles.length} תמונות נבחרו`
                      : "לחצי לבחירת תמונות"}
                  </span>

                  <input
                    id="dress-photos"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFilesSelected}
                    className="sr-only"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleUploadPhotos}
                  disabled={uploadingPhotos || selectedFiles.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingPhotos && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  {uploadingPhotos
                    ? "מעלה..."
                    : `העלאת ${selectedFiles.length} תמונות`}
                </button>
              </div>

              {photoError && (
                <p className="mt-3 text-sm text-red-600">{photoError}</p>
              )}
            </section>

            {canResubmit && (
              <section className="rounded-3xl bg-zinc-900 p-6 text-white shadow-sm">
                <h2 className="text-lg font-bold">שליחה מחדש לאישור</h2>

                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  לאחר שתיקנת את הפרטים והתמונות, שלחי את השמלה לבדיקה
                  מחדש. השמלה תעבור לתור האישור של המנהל.
                </p>

                {resubmitError && (
                  <div className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-200">
                    {resubmitError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleResubmit}
                  disabled={resubmitting}
                  className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-bold text-zinc-900 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resubmitting ? "שולחת..." : "שמור ושלח מחדש לאישור"}
                </button>
              </section>
            )}

            {isApprovedEdit && (
              <section className="rounded-3xl bg-zinc-900 p-6 text-white shadow-sm">
                <h2 className="text-lg font-bold">שליחת העריכה לאישור</h2>

                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {hasPendingChanges
                    ? "לאחר שליחת העריכה לאישור, השינויים ייכנסו לתור הבדיקה של המנהל. הציבור ימשיך לראות את הגרסה הנוכחית עד שהעריכה תאושר, ולא ניתן יהיה לערוך שוב עד להחלטה."
                    : "עדיין לא ביצעת שינויים לשמלה זו."}
                </p>

                {submitEditError && (
                  <div className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-200">
                    {submitEditError}
                  </div>
                )}

                {cancelEditError && (
                  <div className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-200">
                    {cancelEditError}
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleSubmitEdit}
                    disabled={submittingEdit || cancellingEdit || !hasPendingChanges}
                    className="flex-1 rounded-xl bg-white px-4 py-3 font-bold text-zinc-900 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submittingEdit ? "שולחת..." : "שלח עריכה לאישור"}
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={submittingEdit || cancellingEdit || !hasPendingChanges}
                    className="rounded-xl border border-white/20 px-4 py-3 font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cancellingEdit ? "מבטלת..." : "ביטול כל השינויים"}
                  </button>
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
