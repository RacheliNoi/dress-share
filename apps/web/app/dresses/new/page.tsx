"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import {
  ApiError,
  Dress,
  DressPhoto,
  DressSize,
  addDressPhotos,
  addDressSize,
  createDress,
  deleteDressPhoto,
  getDressImageUrl,
  getMyDresses,
  submitDressForApproval,
} from "@/lib/api";
import Header from "@/components/Header";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DressPlaceholder from "@/components/ui/DressPlaceholder";

export default function NewDressPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    setCheckingAuth(false);
  }, [router]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [dress, setDress] = useState<Dress | null>(null);

  const [sizes, setSizes] = useState<DressSize[]>([]);
  const [sizeValue, setSizeValue] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [addingSize, setAddingSize] = useState(false);
  const [sizeError, setSizeError] = useState("");

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedPreviews, setSelectedPreviews] = useState<string[]>([]);
  const [photos, setPhotos] = useState<DressPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState<number | null>(null);
  const [pendingDeletePhotoId, setPendingDeletePhotoId] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (checkingAuth) {
    return null;
  }

  async function handleCreateDress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setCreating(true);
    setCreateError("");

    try {
      const created = await createDress(token, {
        name,
        description: description || undefined,
        category: category || undefined,
        color: color || undefined,
      });

      setDress(created);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.push("/login");
        return;
      }

      setCreateError(
        err instanceof ApiError ? err.message : "שגיאה ביצירת השמלה",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleAddSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    const price = Number(priceValue);

    if (!token || !dress || !sizeValue.trim() || !price) {
      return;
    }

    setAddingSize(true);
    setSizeError("");

    try {
      const created = await addDressSize(token, dress.id, {
        size: sizeValue.trim(),
        price,
      });

      setSizes((current) => [...current, created]);
      setSizeValue("");
      setPriceValue("");
    } catch (err) {
      setSizeError(
        err instanceof ApiError ? err.message : "שגיאה בהוספת המידה",
      );
    } finally {
      setAddingSize(false);
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
        setPhotos(updated.photos);
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

  function handleDeletePhoto(photoId: number) {
    setPendingDeletePhotoId(photoId);
  }

  async function confirmDeletePhoto() {
    const token = getToken();
    const photoId = pendingDeletePhotoId;

    if (!token || !dress || photoId === null) {
      setPendingDeletePhotoId(null);
      return;
    }

    setDeletingPhotoId(photoId);
    setPhotoError("");

    try {
      await deleteDressPhoto(token, dress.id, photoId);
      setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    } catch (err) {
      setPhotoError(
        err instanceof ApiError ? err.message : "שגיאה במחיקת התמונה",
      );
    } finally {
      setDeletingPhotoId(null);
      setPendingDeletePhotoId(null);
    }
  }

  async function handleSubmitForApproval() {
    const token = getToken();

    if (!token || !dress) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      await submitDressForApproval(token, dress.id);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "שגיאה בשליחה לאישור",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 lg:py-14">
        <Link
          href="/dresses"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition hover:text-accent"
        >
          → חזרה לשמלות שלי
        </Link>

        <h1 className="text-3xl font-black tracking-tight text-zinc-900">
          העלאת שמלה חדשה
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          מלאי את פרטי השמלה, הוסיפי מידות ותמונות, ושלחי לאישור מנהל.
        </p>

        {submitted ? (
          <section className="mt-8 rounded-[28px] border border-success-soft bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-4xl">
              ✅
            </div>

            <h2 className="mt-6 text-2xl font-black text-zinc-900">
              השמלה נשלחה לאישור!
            </h2>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
              השמלה תופיע בקטלוג הציבורי לאחר שמנהל יאשר אותה. תוכלי לעקוב
              אחרי הסטטוס בעמוד "השמלות שלי".
            </p>

            <Link
              href="/dresses"
              className="mt-7 inline-flex rounded-full bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
            >
              מעבר לשמלות שלי
            </Link>
          </section>
        ) : !dress ? (
          <section className="mt-8 rounded-[20px] bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
            <h2 className="text-lg font-bold text-zinc-900">
              1. פרטי השמלה
            </h2>

            <form
              onSubmit={handleCreateDress}
              className="mt-5 grid gap-4 md:grid-cols-2"
            >
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="שם השמלה"
                required
                className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft md:col-span-2"
              />

              <input
                type="text"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="קטגוריה (למשל: ערב)"
                className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
              />

              <input
                type="text"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                placeholder="צבע"
                className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
              />

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="תיאור השמלה"
                rows={4}
                className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft md:col-span-2"
              />

              {createError && (
                <div className="rounded-2xl bg-error-soft p-4 text-sm text-error md:col-span-2">
                  {createError}
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-zinc-900 px-4 py-3 font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
              >
                {creating ? "יוצרת..." : "המשך להוספת מידות ותמונות"}
              </button>
            </form>
          </section>
        ) : (
          <div className="mt-8 space-y-6">
            <section className="rounded-[20px] bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-zinc-900">
                  {dress.name}
                </h2>

                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">
                  טיוטה
                </span>
              </div>

              <p className="mt-1 text-sm text-zinc-500">
                {dress.category || "ללא קטגוריה"}
                {dress.color && ` · ${dress.color}`}
              </p>

              {dress.description && (
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  {dress.description}
                </p>
              )}
            </section>

            <section className="rounded-[20px] bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
              <h2 className="text-lg font-bold text-zinc-900">
                2. מידות ומחירים
              </h2>

              {sizes.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {sizes.map((size) => (
                    <li
                      key={size.id}
                      className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700"
                    >
                      מידה {size.size} · {size.price} ₪
                    </li>
                  ))}
                </ul>
              )}

              <form
                onSubmit={handleAddSize}
                className="mt-4 flex flex-col gap-3 sm:flex-row"
              >
                <input
                  type="text"
                  value={sizeValue}
                  onChange={(event) => setSizeValue(event.target.value)}
                  placeholder="מידה (למשל: M)"
                  className="flex-1 rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                />

                <input
                  type="number"
                  min={0}
                  value={priceValue}
                  onChange={(event) => setPriceValue(event.target.value)}
                  placeholder="מחיר (₪)"
                  className="flex-1 rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                />

                <button
                  type="submit"
                  disabled={addingSize || !sizeValue.trim() || !priceValue}
                  className="rounded-xl border border-zinc-300 px-5 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingSize ? "מוסיפה..." : "+ הוספת מידה"}
                </button>
              </form>

              {sizeError && (
                <p className="mt-3 text-sm text-error">{sizeError}</p>
              )}
            </section>

            <section className="rounded-[20px] bg-white p-6 shadow-sm ring-1 ring-zinc-200/60 sm:p-7">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold text-zinc-900">
                  3. תמונות
                </h2>

                {(photos.length > 0 || selectedFiles.length > 0) && (
                  <span className="text-xs font-medium text-zinc-400">
                    {photos.length > 0 && `${photos.length} הועלו`}
                    {photos.length > 0 && selectedFiles.length > 0 && " · "}
                    {selectedFiles.length > 0 &&
                      `${selectedFiles.length} ממתינות`}
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-zinc-500">
                תמונות איכותיות עוזרות לשמלה שלך לבלוט בקטלוג.
              </p>

              {/* Uploaded gallery */}
              {photos.length > 0 && (
                <div className="mt-6">
                  <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    תמונות שהועלו
                  </p>

                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="group relative aspect-square animate-fade-scale-in overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/70 transition duration-300 hover:shadow-lg"
                        style={{ animationDelay: `${index * 40}ms` }}
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

                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo.id)}
                          disabled={deletingPhotoId === photo.id}
                          aria-label="מחיקת תמונה"
                          className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/60 text-xs font-bold text-white shadow-sm backdrop-blur transition duration-200 hover:scale-110 hover:bg-error disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingPhotoId === photo.id ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          ) : (
                            "✕"
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected, waiting to upload */}
              {selectedPreviews.length > 0 && (
                <div className="mt-6">
                  <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-warning">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                    ממתינות להעלאה
                  </p>

                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {selectedPreviews.map((preview, index) => (
                      <div
                        key={preview}
                        className="relative aspect-square animate-fade-scale-in overflow-hidden rounded-2xl border-2 border-dashed border-warning/50 bg-warning-soft/40"
                        style={{ animationDelay: `${index * 40}ms` }}
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

              {/* Empty state */}
              {photos.length === 0 && selectedPreviews.length === 0 && (
                <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl bg-surface-sunken px-6 py-10 text-center">
                  <div className="h-16 w-16 overflow-hidden rounded-2xl">
                    <DressPlaceholder size="md" />
                  </div>
                  <p className="text-sm font-medium text-zinc-600">
                    עדיין לא הועלו תמונות
                  </p>
                  <p className="text-xs text-zinc-400">
                    הוסיפי תמונות איכותיות כדי להציג את השמלה בצורה הטובה
                    ביותר
                  </p>
                </div>
              )}

              {/* Dropzone + upload action */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <label
                  htmlFor="dress-photos"
                  className="group flex flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-3.5 text-sm text-zinc-600 transition duration-200 hover:border-accent-soft-strong hover:bg-accent-soft/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-zinc-200 transition duration-200 group-hover:ring-accent-soft-strong">
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
                <p className="mt-3 text-sm text-error">{photoError}</p>
              )}
            </section>

            <section className="rounded-[20px] bg-zinc-900 p-6 text-white shadow-sm">
              <h2 className="text-lg font-bold">4. שליחה לאישור</h2>

              <p className="mt-2 text-sm leading-6 text-zinc-300">
                לאחר השליחה השמלה תמתין לבדיקת מנהל, ותופיע בקטלוג הציבורי
                רק לאחר אישור.
              </p>

              {submitError && (
                <div className="mt-4 rounded-2xl bg-error/15 p-4 text-sm text-error-soft">
                  {submitError}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmitForApproval}
                disabled={submitting}
                className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-bold text-zinc-900 transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "שולחת..." : "שליחה לאישור"}
              </button>
            </section>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeletePhotoId !== null}
        title="למחוק את התמונה?"
        confirmLabel="מחיקת התמונה"
        cancelLabel="ביטול"
        danger
        loading={deletingPhotoId === pendingDeletePhotoId}
        onConfirm={confirmDeletePhoto}
        onCancel={() => setPendingDeletePhotoId(null)}
      />
    </main>
  );
}
