"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";
import { changePassword, ApiError } from "@/lib/api";
import Header from "@/components/Header";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FormMessage from "@/components/ui/FormMessage";

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

      setSuccess("הסיסמה עודכנה בהצלחה.");
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
    <main dir="rtl" className="min-h-screen bg-paper text-ink">
      <Header />

      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[20px] bg-surface p-8 shadow-sm ring-1 ring-line">
          <h1 className="font-display text-3xl font-semibold text-ink">
            שינוי סיסמה
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            עדכני את סיסמת החשבון שלך. תצטרכי להזין את הסיסמה הנוכחית.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <TextField
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="סיסמה נוכחית"
              required
              autoComplete="current-password"
            />

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
            {success && <FormMessage variant="success">{success}</FormMessage>}

            <Button type="submit" disabled={loading} fullWidth>
              {loading ? "מעדכנת..." : "עדכון סיסמה"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
