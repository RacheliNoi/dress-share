"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setToken } from "@/lib/auth";

const API_URL = "http://localhost:3001";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "שגיאה בהרשמה");
      }

      if (data.accessToken) {
        setToken(data.accessToken);
        router.push("/dresses");
        return;
      }

      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהרשמה");
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

        <h1 className="mt-1 text-3xl font-bold text-zinc-900">הרשמה</h1>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="שם מלא"
            className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
          />

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
            minLength={6}
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
            {loading ? "נרשמת..." : "הרשמה"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          כבר יש לך חשבון?{" "}
          <Link
            href="/login"
            className="font-medium text-zinc-900 underline underline-offset-4"
          >
            התחברות
          </Link>
        </p>
      </div>
    </main>
  );
}
