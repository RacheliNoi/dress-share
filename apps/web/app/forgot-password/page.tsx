"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { requestPasswordReset, ApiError } from "@/lib/api";
import Header from "@/components/Header";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      await requestPasswordReset(email);
      // The API always returns the same generic response, whether or not
      // the email exists, so the UI never reveals which case it was.
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "שגיאה בשליחת הבקשה",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-zinc-100">
      <Header />

      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-zinc-900">שכחת סיסמה?</h1>
          <p className="mt-2 text-sm text-zinc-500">
            הזיני את כתובת האימייל שלך. אם קיים חשבון תואם, יישלח אליו קישור
            לאיפוס הסיסמה.
          </p>

          {submitted ? (
            <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
              אם קיים חשבון עם האימייל הזה, קישור לאיפוס הסיסמה נשלח אליו.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="אימייל"
                required
                className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
              />

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
                {loading ? "שולחת..." : "שליחת קישור לאיפוס"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-zinc-500">
            נזכרת בסיסמה?{" "}
            <Link
              href="/login"
              className="font-medium text-zinc-900 underline underline-offset-4"
            >
              התחברות
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
