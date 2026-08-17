"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";
import { changePassword, ApiError } from "@/lib/api";
import Header from "@/components/Header";

export default function AccountPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getUser();

    if (!token || !user) {
      router.push("/login");
      return;
    }

    setCheckingAuth(false);
  }, [router]);

  if (checkingAuth) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await changePassword(token, {
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setSuccess("הסיסמה עודכנה בהצלחה");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "שגיאה בעדכון הסיסמה",
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
          <h1 className="text-3xl font-bold text-zinc-900">שינוי סיסמה</h1>
          <p className="mt-2 text-sm text-zinc-500">
            עדכני את סיסמת החשבון שלך. תצטרכי להזין את הסיסמה הנוכחית.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="סיסמה נוכחית"
              required
              autoComplete="current-password"
              className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
            />

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

            {success && (
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-zinc-900 px-4 py-3 font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "מעדכנת..." : "עדכון סיסמה"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
