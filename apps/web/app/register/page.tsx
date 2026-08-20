"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markWelcomeNoticePending, setToken, setUser } from "@/lib/auth";
import { register, ApiError } from "@/lib/api";
import Header from "@/components/Header";

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
      const data = await register(name, email, password);

      setToken(data.accessToken);
      setUser(data.user);
      markWelcomeNoticePending();
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "שגיאה בהרשמה",
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
        <h1 className="text-3xl font-bold text-zinc-900">הרשמה</h1>

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
      </div>
    </main>
  );
}
