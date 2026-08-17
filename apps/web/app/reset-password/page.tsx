"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword, ApiError } from "@/lib/api";
import Header from "@/components/Header";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      await resetPassword({ token, newPassword, confirmPassword });
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "שגיאה באיפוס הסיסמה",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
        קישור האיפוס אינו תקין. יש לבקש קישור חדש מדף &quot;שכחתי סיסמה&quot;.
      </div>
    );
  }

  if (success) {
    return (
      <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
        הסיסמה אופסה בהצלחה. מעבירה אותך להתחברות...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
      <input
        type="password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        placeholder="סיסמה חדשה"
        required
        minLength={8}
        autoComplete="new-password"
        className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
      />

      <input
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        placeholder="אימות סיסמה חדשה"
        required
        minLength={8}
        autoComplete="new-password"
        className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
      />

      <p className="text-xs text-zinc-400">
        הסיסמה חייבת לכלול לפחות 8 תווים, עם אות אחת וספרה אחת לפחות.
      </p>

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-zinc-900 px-4 py-3 font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "מאפסת..." : "איפוס סיסמה"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-zinc-100">
      <Header />

      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-zinc-900">איפוס סיסמה</h1>
          <p className="mt-2 text-sm text-zinc-500">
            בחרי סיסמה חדשה לחשבון שלך.
          </p>

          <Suspense
            fallback={
              <div className="mt-6 h-40 animate-pulse rounded-2xl bg-zinc-100" />
            }
          >
            <ResetPasswordForm />
          </Suspense>

          <p className="mt-6 text-center text-sm text-zinc-500">
            <Link
              href="/login"
              className="font-medium text-zinc-900 underline underline-offset-4"
            >
              חזרה להתחברות
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
