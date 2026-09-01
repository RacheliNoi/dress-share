"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";
import { ApiError, AuthUser, DressSize, createInterestedBooking } from "@/lib/api";
import { buttonClassName } from "./ui/Button";

// Renter-facing counterpart to DressAvailabilityManager's owner-side form -
// both end up calling the same POST /bookings/interested, but this one is
// scoped to a single size per submission (no multi-size batch picking) since
// a real renter is booking for herself, not pre-seeding several hypothetical
// units at once.
export default function InterestedBookingButton({
  dressId,
  ownerId,
  sizes,
}: {
  dressId: number;
  ownerId: number;
  sizes: DressSize[];
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [size, setSize] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const hasSizes = sizes.length > 0;

  useEffect(() => {
    setUser(getUser());
    setMounted(true);
  }, []);

  if (!mounted || (user && user.id === ownerId)) {
    return null;
  }

  function openModal() {
    if (!user) {
      router.push("/login");
      return;
    }

    setError("");
    setSuccess(false);
    setStartDate("");
    setEndDate("");
    setSize("");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();

    if (!token || !startDate || !endDate) {
      return;
    }

    if (endDate < startDate) {
      setError("תאריך הסיום לא יכול להיות לפני תאריך ההתחלה");
      return;
    }

    if (hasSizes && !size) {
      setError("יש לבחור מידה");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await createInterestedBooking(token, {
        dressId,
        startDate,
        endDate,
        size: hasSizes ? size : undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "שגיאה בשליחת הבקשה. נסי שוב.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={buttonClassName("primary", "mt-6 w-full sm:w-auto")}
      >
        מעוניינת בהשכרה
      </button>

      {open && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="interested-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="animate-fade-scale-in w-full max-w-sm rounded-[20px] bg-surface p-6 shadow-[0_24px_56px_-16px_rgba(34,31,31,0.35)]"
          >
            {success ? (
              <>
                <h2 id="interested-modal-title" className="text-lg font-bold text-ink">
                  הבקשה נשלחה!
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  בעלת השמלה תקבל הודעה על ההתעניינות שלך. אפשר לעקוב אחרי
                  הסטטוס בעמוד &quot;הבקשות שלי&quot;.
                </p>
                <button
                  type="button"
                  onClick={closeModal}
                  className={buttonClassName("primary", "mt-6 w-full")}
                >
                  סגירה
                </button>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2 id="interested-modal-title" className="text-lg font-bold text-ink">
                  מעוניינת בהשכרה
                </h2>

                <div className="mt-4 grid gap-3">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    required
                    aria-label="תאריך התחלה"
                    className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                  />

                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    required
                    aria-label="תאריך סיום"
                    className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                  />

                  {hasSizes && (
                    <select
                      value={size}
                      onChange={(event) => setSize(event.target.value)}
                      required
                      aria-label="מידה"
                      className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                    >
                      <option value="">בחירת מידה...</option>
                      {sizes.map((candidate) => (
                        <option key={candidate.id} value={candidate.size}>
                          מידה {candidate.size} · {candidate.price} ₪
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {error && (
                  <div className="mt-3 rounded-2xl bg-error-soft p-4 text-sm text-error">
                    {error}
                  </div>
                )}

                <div className="mt-6 flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className={buttonClassName("primary", "flex-1")}
                  >
                    {submitting ? "שולחת..." : "שליחת בקשה"}
                  </button>

                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className={buttonClassName("secondary", "flex-1")}
                  >
                    ביטול
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
