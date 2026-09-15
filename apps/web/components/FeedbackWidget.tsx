"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getToken, isAuthenticated } from "@/lib/auth";
import { ApiError, submitFeedback } from "@/lib/api";

const MAX_LENGTH = 2000;

// Mounted once in the root layout - starts hidden on every render (including
// the pre-hydration one) and only turns on from an effect after mount, same
// hydration-mismatch reasoning as AnnouncementBar: a first server-side render
// never sees a token. Re-checks on every pathname change (not just once on
// mount) since the layout persists across client-side navigation, so a
// mount-only check would miss the token a login/register page just set via
// router.push, only picking it up on a full page reload.
export default function FeedbackWidget() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setAuthed(isAuthenticated());
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!authed) {
    return null;
  }

  function openWidget() {
    setOpen(true);
    setSent(false);
    setError("");
    setMessage("");
  }

  function close() {
    setOpen(false);
  }

  async function handleSubmit() {
    const token = getToken();
    const trimmed = message.trim();

    if (!token || !trimmed) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await submitFeedback(token, trimmed);
      setSent(true);
      setMessage("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "שליחת המשוב נכשלה. נסי שוב.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openWidget}
        aria-label="שליחת משוב"
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_30px_-10px_rgba(34,31,31,0.4)] transition hover:-translate-y-0.5 hover:bg-ink/85 sm:bottom-6 sm:right-6"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
        </svg>
        משוב
      </button>

      {open && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
            onClick={(event) => event.stopPropagation()}
            className="animate-fade-scale-in w-full max-w-sm rounded-[20px] bg-surface p-6 shadow-[0_24px_56px_-16px_rgba(34,31,31,0.35)]"
          >
            {sent ? (
              <>
                <h2 className="text-lg font-bold text-ink">תודה!</h2>

                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  קיבלנו את המשוב שלך ונשמח לקרוא אותו.
                </p>

                <button
                  type="button"
                  onClick={close}
                  className="mt-6 w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white transition hover:bg-ink/80"
                >
                  סגירה
                </button>
              </>
            ) : (
              <>
                <h2 id="feedback-dialog-title" className="text-lg font-bold text-ink">
                  יש לך רעיון או הערה?
                </h2>

                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  נשמח לשמוע מה עובד, מה לא, ומה כדאי להוסיף.
                </p>

                <textarea
                  value={message}
                  onChange={(event) =>
                    setMessage(event.target.value.slice(0, MAX_LENGTH))
                  }
                  placeholder="כתבי כאן את המשוב שלך..."
                  rows={5}
                  autoFocus
                  className="mt-4 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-ink"
                />

                {error && <p className="mt-2 text-sm text-error">{error}</p>}

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !message.trim()}
                    className="flex-1 rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white transition hover:bg-ink/80 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "שולחת..." : "שליחה"}
                  </button>

                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-ink-soft transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ביטול
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
