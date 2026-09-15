"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser, logout, setToken } from "@/lib/auth";
import { changePassword, logoutAllDevices, ApiError } from "@/lib/api";
import Header from "@/components/Header";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FormMessage from "@/components/ui/FormMessage";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function AccountPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState("");

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

  const user = getUser();
  const greetingName = user?.name || user?.email || "";

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
      const response = await changePassword(token, {
        currentPassword,
        newPassword,
        confirmPassword,
      });

      // The password change just invalidated every previously-issued
      // token, including the one this request used - store the fresh one
      // the backend issued so this device stays logged in.
      setToken(response.accessToken);

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

  async function handleConfirmLogoutAll() {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setLoggingOutAll(true);
    setLogoutAllError("");

    try {
      await logoutAllDevices(token);
      // The call above just invalidated this device's own token too - the
      // explicit point of "log out everywhere" is to end this session as
      // well, so clear it locally and send her to log back in.
      logout();
      router.push("/login");
    } catch (err) {
      setLogoutAllError(
        err instanceof ApiError ? err.message : "ההתנתקות נכשלה. נסי שוב.",
      );
      setLoggingOutAll(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-paper text-ink">
      <Header />

      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 lg:py-14">
        <p className="mb-2 text-sm font-medium text-accent">החשבון שלך</p>

        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
          {greetingName ? `שלום, ${greetingName}` : "החשבון שלך"}
        </h1>

        <p className="mt-2 text-sm text-ink-soft">
          כאן תוכלי לעדכן את הסיסמה שלך ולשמור על החשבון מאובטח.
        </p>

        <div className="mt-8 w-full max-w-md rounded-[20px] bg-surface p-8 shadow-sm ring-1 ring-line">
          <h2 className="text-lg font-bold text-ink">שינוי סיסמה</h2>
          <p className="mt-1 text-sm text-ink-soft">
            תצטרכי להזין את הסיסמה הנוכחית.
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

        <div className="mt-6 w-full max-w-md rounded-[20px] bg-surface p-8 shadow-sm ring-1 ring-line">
          <h2 className="text-lg font-bold text-ink">התנתקות מכל המכשירים</h2>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            מתנתקת מכל המכשירים והדפדפנים שבהם התחברת בעבר, כולל המכשיר הזה.
            שימושי אם את חוששת שמישהי אחרת קיבלה גישה לחשבון שלך.
          </p>

          <button
            type="button"
            onClick={() => {
              setLogoutAllError("");
              setConfirmingLogoutAll(true);
            }}
            className="mt-4 rounded-xl border border-error-soft px-4 py-2.5 text-sm font-bold text-error transition hover:bg-error-soft"
          >
            התנתקות מכל המכשירים
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingLogoutAll}
        title="להתנתק מכל המכשירים?"
        description={`תנותקי מיד מכל מכשיר, כולל זה שבו את נמצאת עכשיו, ותצטרכי להתחבר מחדש.${logoutAllError ? ` ${logoutAllError}` : ""}`}
        confirmLabel="התנתקות מכל המכשירים"
        danger
        loading={loggingOutAll}
        onConfirm={handleConfirmLogoutAll}
        onCancel={() => setConfirmingLogoutAll(false)}
      />
    </main>
  );
}
