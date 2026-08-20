"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword, ApiError } from "@/lib/api";
import Header from "@/components/Header";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FormMessage from "@/components/ui/FormMessage";

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
      <div className="mt-6">
        <FormMessage variant="error">
          קישור האיפוס אינו תקין. יש לבקש קישור חדש מדף &quot;שכחתי סיסמה&quot;.
        </FormMessage>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mt-6">
        <FormMessage variant="success">
          הסיסמה אופסה בהצלחה. מעבירה אותך להתחברות...
        </FormMessage>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
      <TextField
        type="password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        placeholder="סיסמה חדשה"
        required
        minLength={8}
        autoComplete="new-password"
      />

      <TextField
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        placeholder="אימות סיסמה חדשה"
        required
        minLength={8}
        autoComplete="new-password"
      />

      <p className="text-xs text-ink-faint">
        הסיסמה חייבת לכלול לפחות 8 תווים, עם אות אחת וספרה אחת לפחות.
      </p>

      {error && <FormMessage variant="error">{error}</FormMessage>}

      <Button type="submit" disabled={loading} fullWidth>
        {loading ? "מאפסת..." : "איפוס סיסמה"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-paper text-ink">
      <Header />

      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[20px] bg-surface p-8 shadow-sm ring-1 ring-line">
          <h1 className="font-display text-3xl font-semibold text-ink">
            איפוס סיסמה
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            בחרי סיסמה חדשה לחשבון שלך.
          </p>

          <Suspense
            fallback={
              <div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface-sunken" />
            }
          >
            <ResetPasswordForm />
          </Suspense>

          <p className="mt-6 text-center text-sm text-ink-soft">
            <Link
              href="/login"
              className="font-medium text-ink underline underline-offset-4"
            >
              חזרה להתחברות
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
