"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { requestPasswordReset, ApiError } from "@/lib/api";
import Header from "@/components/Header";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FormMessage from "@/components/ui/FormMessage";

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
    <main dir="rtl" className="min-h-screen bg-paper text-ink">
      <Header />

      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[20px] bg-surface p-8 shadow-sm ring-1 ring-line">
          <h1 className="font-display text-3xl font-semibold text-ink">
            שכחת סיסמה?
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            הזיני את כתובת האימייל שלך. אם קיים חשבון תואם, יישלח אליו קישור
            לאיפוס הסיסמה.
          </p>

          {submitted ? (
            <div className="mt-6">
              <FormMessage variant="success">
                אם קיים חשבון עם האימייל הזה, קישור לאיפוס הסיסמה נשלח אליו.
              </FormMessage>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
              <TextField
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="אימייל"
                required
              />

              {error && <FormMessage variant="error">{error}</FormMessage>}

              <Button type="submit" disabled={loading} fullWidth>
                {loading ? "שולחת..." : "שליחת קישור לאיפוס"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-ink-soft">
            נזכרת בסיסמה?{" "}
            <Link
              href="/login"
              className="font-medium text-ink underline underline-offset-4"
            >
              התחברות
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
