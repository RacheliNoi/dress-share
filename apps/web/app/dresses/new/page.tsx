"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import {
  ApiError,
  Dress,
  DressSize,
  addDressPhotos,
  addDressSize,
  createDress,
  submitDressForApproval,
} from "@/lib/api";
import Header from "@/components/Header";

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
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState("");

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
    setSelectedFiles(Array.from(event.target.files ?? []));
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

      setPhotoPreviews((current) => [
        ...current,
        ...selectedFiles.map((file) => URL.createObjectURL(file)),
      ]);
      setSelectedFiles([]);

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
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition hover:text-rose-500"
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
          <section className="mt-8 rounded-[2rem] border border-emerald-100 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-4xl">
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
          <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
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

              {createError && (
                <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 md:col-span-2">
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
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
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

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
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
                  className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
                />

                <input
                  type="number"
                  min={0}
                  value={priceValue}
                  onChange={(event) => setPriceValue(event.target.value)}
                  placeholder="מחיר בש״ח"
                  className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
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
                <p className="mt-3 text-sm text-red-600">{sizeError}</p>
              )}
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/60">
              <h2 className="text-lg font-bold text-zinc-900">
                3. תמונות
              </h2>

              {photoPreviews.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {photoPreviews.map((src, index) => (
                    <img
                      key={index}
                      src={src}
                      alt={`תמונה ${index + 1}`}
                      className="h-20 w-20 rounded-2xl object-cover"
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  id="dress-photos"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFilesSelected}
                  className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-700"
                />

                <button
                  type="button"
                  onClick={handleUploadPhotos}
                  disabled={uploadingPhotos || selectedFiles.length === 0}
                  className="rounded-xl border border-zinc-300 px-5 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingPhotos
                    ? "מעלה..."
                    : `העלאת ${selectedFiles.length} תמונות`}
                </button>
              </div>

              {photoError && (
                <p className="mt-3 text-sm text-red-600">{photoError}</p>
              )}
            </section>

            <section className="rounded-3xl bg-zinc-900 p-6 text-white shadow-sm">
              <h2 className="text-lg font-bold">4. שליחה לאישור</h2>

              <p className="mt-2 text-sm leading-6 text-zinc-300">
                לאחר השליחה השמלה תמתין לבדיקת מנהל, ותופיע בקטלוג הציבורי
                רק לאחר אישור.
              </p>

              {submitError && (
                <div className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-200">
                  {submitError}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmitForApproval}
                disabled={submitting}
                className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-bold text-zinc-900 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "שולחת..." : "שליחה לאישור"}
              </button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
