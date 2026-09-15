"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, getUser } from "@/lib/auth";
import { ApiError, Feedback, deleteFeedback, getFeedback } from "@/lib/api";
import Header from "@/components/Header";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminFeedbackPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Feedback | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function loadFeedback() {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await getFeedback(token);
      setFeedback(data);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.push("/");
        return;
      }

      setError("לא הצלחנו לטעון את המשוב. נסי שוב.");
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
    loadFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checkingAuth) {
    return null;
  }

  async function handleConfirmDelete() {
    const token = getToken();

    if (!token || !pendingDelete) {
      return;
    }

    setDeletingId(pendingDelete.id);
    setDeleteError("");

    try {
      await deleteFeedback(token, pendingDelete.id);
      setFeedback((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "מחיקת המשוב נכשלה. נסי שוב.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="mb-6 flex gap-2">
          <Link
            href="/admin"
            className="rounded-full px-4 py-2 text-sm font-bold text-zinc-500 transition hover:bg-white hover:text-zinc-900"
          >
            שמלות ממתינות
          </Link>

          <span className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white">
            משוב
          </span>
        </div>

        <section className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-accent">
              אזור ניהול
            </p>

            <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-900">
              משוב ורעיונות ממשתמשות
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              כל מה שנשלח דרך כפתור המשוב באתר, מהחדש לישן.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2.5 text-sm shadow-sm ring-1 ring-accent-soft-strong">
            <span className="font-bold text-accent-deep">{feedback.length}</span>
            <span className="text-accent-deep/80">הודעות</span>
          </div>
        </section>

        {error && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-error-soft bg-error-soft px-5 py-4 text-sm text-error">
            <span>{error}</span>

            <button
              type="button"
              onClick={loadFeedback}
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
                className="h-24 animate-pulse rounded-[20px] bg-white shadow-sm ring-1 ring-line"
              />
            ))}
          </div>
        ) : feedback.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-20 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-4xl">
              💬
            </div>

            <h2 className="mt-6 text-2xl font-black text-zinc-900">
              עדיין לא התקבל משוב
            </h2>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
              כשמשתמשות ישלחו משוב דרך הכפתור באתר, הוא יופיע כאן.
            </p>
          </section>
        ) : (
          <div className="space-y-4">
            {feedback.map((item, index) => (
              <article
                key={item.id}
                style={{ animationDelay: `${Math.min(index, 10) * 60}ms` }}
                className="animate-fade-scale-in rounded-[20px] bg-white p-5 shadow-sm ring-1 ring-line"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-zinc-900">
                    {item.user ? item.user.name || item.user.email : "אנונימית (לא מחוברת)"}
                  </p>

                  <div className="flex items-center gap-3">
                    <p className="text-xs text-zinc-400">
                      {formatDate(item.createdAt)}
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("");
                        setPendingDelete(item);
                      }}
                      aria-label="מחיקת המשוב"
                      className="text-xs font-bold text-error underline-offset-4 transition hover:underline"
                    >
                      מחיקה
                    </button>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                  {item.message}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="למחוק את המשוב?"
        description={
          pendingDelete
            ? `המשוב מ"${pendingDelete.user ? pendingDelete.user.name || pendingDelete.user.email : "אנונימית (לא מחוברת)"}" יימחק לצמיתות. אי אפשר לבטל את זה.${deleteError ? ` ${deleteError}` : ""}`
            : undefined
        }
        confirmLabel="מחיקה"
        danger
        loading={deletingId === pendingDelete?.id}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  );
}
