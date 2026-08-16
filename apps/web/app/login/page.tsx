"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setToken } from "@/lib/auth";

const API_URL = "http://localhost:3001";

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
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "אימייל או סיסמה שגויים");
      }

      setToken(data.accessToken);
      router.push("/dresses");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהתחברות");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-zinc-100 p-6"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-zinc-500">DressShare</p>

        <h1 className="mt-1 text-3xl font-bold text-zinc-900">התחברות</h1>

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
    </main>
  );
}
