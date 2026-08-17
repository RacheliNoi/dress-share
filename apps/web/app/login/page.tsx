"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setToken, setUser } from "@/lib/auth";
import { login, ApiError } from "@/lib/api";
import Header from "@/components/Header";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const data = await login(email, password);

      setToken(data.accessToken);
      setUser(data.user);
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "שגיאה בהתחברות",
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
        <h1 className="text-3xl font-bold text-zinc-900">התחברות</h1>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="אימייל"
            required
            className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
          />

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="סיסמה"
            required
            className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
          />

          <Link
            href="/forgot-password"
            className="-mt-2 text-sm font-medium text-zinc-500 underline underline-offset-4 hover:text-zinc-900"
          >
            שכחת סיסמה?
          </Link>

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
            {loading ? "מתחברת..." : "התחברות"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          עדיין אין לך חשבון?{" "}
          <Link
            href="/register"
            className="font-medium text-zinc-900 underline underline-offset-4"
          >
            הרשמה
          </Link>
        </p>
      </div>
      </div>
    </main>
  );
}
