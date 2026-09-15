"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeRedirectPath, setToken, setUser } from "@/lib/auth";
import { login, ApiError } from "@/lib/api";
import Header from "@/components/Header";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FormMessage from "@/components/ui/FormMessage";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const redirectTarget = safeRedirectPath(rawRedirect);

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
      router.push(redirectTarget);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "שגיאה בהתחברות",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <TextField
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="אימייל"
          required
        />

        <TextField
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="סיסמה"
          required
        />

        <Link
          href="/forgot-password"
          className="-mt-2 text-sm font-medium text-ink-faint underline underline-offset-4 hover:text-accent"
        >
          שכחת סיסמה?
        </Link>

        {error && <FormMessage variant="error">{error}</FormMessage>}

        <Button type="submit" disabled={loading} fullWidth>
          {loading ? "מתחברת..." : "התחברות"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        עדיין אין לך חשבון?{" "}
        <Link
          href={
            rawRedirect
              ? `/register?redirect=${encodeURIComponent(rawRedirect)}`
              : "/register"
          }
          className="font-medium text-ink underline underline-offset-4"
        >
          הרשמה
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-paper text-ink">
      <Header />

      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[20px] bg-surface p-8 shadow-sm ring-1 ring-line">
          <h1 className="font-display text-3xl font-semibold text-ink">
            התחברות
          </h1>

          <Suspense
            fallback={
              <div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-sunken" />
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
