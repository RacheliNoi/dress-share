"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";
import {
  ApiError,
  AuthUser,
  DressAvailabilityEntry,
  DressSize,
  createInterestedBooking,
  getDressAvailability,
} from "@/lib/api";
import { getPeakUsageForRange } from "@/lib/availability";
import { buttonClassName } from "./ui/Button";

// Same multi-size/multi-unit selection logic as the owner's old booking-
// creation form (DressAvailabilityManager, before owner-1's redesign moved
// creation to the renter) - reused rather than reinvented, since it already
// correctly mirrors the backend's per-size, quantity-aware capacity check.
// The one deliberate change from that original: sizes are picked from a
// card grid instead of a native <select><option> list - a native <option>
// can't reliably apply RTL/bidi text isolation to mixed Hebrew+number+
// currency content, which was the actual cause of the size/price/quantity
// line reading in a scrambled order for some users.
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
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>([]);
  const [availability, setAvailability] = useState<DressAvailabilityEntry[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successCount, setSuccessCount] = useState(0);

  const hasSizes = sizes.length > 0;

  useEffect(() => {
    setUser(getUser());
    setMounted(true);
  }, []);

  if (!mounted || (user && user.id === ownerId)) {
    return null;
  }

  const selectedSizes = selectedSizeIds
    .map((id) => sizes.find((candidate) => String(candidate.id) === id))
    .filter((size): size is DressSize => Boolean(size));

  const datesSelected = Boolean(startDate && endDate && endDate >= startDate);

  function selectedCountFor(sizeId: string) {
    return selectedSizeIds.filter((id) => id === sizeId).length;
  }

  // Units not already committed to an existing active booking - deliberately
  // ignores whatever this form has provisionally picked, since that's not
  // "occupied," just already claimed by this same in-progress request.
  function existingRemainingUnits(size: DressSize): number {
    if (!datesSelected) {
      return size.quantity;
    }

    const { peakUsage, wholeDressBlocked } = getPeakUsageForRange(
      startDate,
      endDate,
      availability,
      size.size,
    );

    if (wholeDressBlocked) {
      return 0;
    }

    return size.quantity - peakUsage;
  }

  // Existing bookings AND this form's own already-selected units both count
  // against quantity - recomputed on every render (never cached), so
  // removing a selection immediately makes that unit pickable again.
  function remainingUnitsForSelection(size: DressSize): number {
    return existingRemainingUnits(size) - selectedCountFor(String(size.id));
  }

  const totalPrice = selectedSizes.reduce((sum, size) => sum + size.price, 0);

  async function openModal() {
    if (!user) {
      router.push("/login");
      return;
    }

    setError("");
    setSuccess(false);
    setSuccessCount(0);
    setStartDate("");
    setEndDate("");
    setSelectedSizeIds([]);
    setOpen(true);

    if (hasSizes) {
      setAvailabilityLoading(true);
      try {
        const data = await getDressAvailability(dressId);
        setAvailability(data);
      } catch {
        // Fails open - same as everywhere else this endpoint is read: an
        // unknown remaining count just shows full capacity, the backend's
        // own SERIALIZABLE check on submit is still the real protection
        // against overselling.
      } finally {
        setAvailabilityLoading(false);
      }
    }
  }

  function closeModal() {
    setOpen(false);
  }

  function addSizeToSelection(id: string) {
    setSelectedSizeIds((current) => [...current, id]);
  }

  // Removes exactly ONE selected unit at the given index - not "all
  // selections of this size" - the same size can appear multiple times.
  function removeSizeFromSelection(index: number) {
    setSelectedSizeIds((current) => current.filter((_, current_) => current_ !== index));
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

    if (hasSizes && selectedSizes.length === 0) {
      setError("יש לבחור לפחות מידה אחת");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (!hasSizes) {
        await createInterestedBooking(token, { dressId, startDate, endDate });
        setSuccessCount(1);
        setSuccess(true);
        return;
      }

      // One request per selected unit, submitted together - independent
      // sizes never conflict with each other, so a per-size failure (e.g.
      // one size taken for this range by the time of submit) doesn't block
      // the rest from going through.
      const outcomes = await Promise.allSettled(
        selectedSizes.map((size) =>
          createInterestedBooking(token, {
            dressId,
            startDate,
            endDate,
            size: size.size,
          }),
        ),
      );

      const failedSizes = outcomes
        .map((outcome, index) => ({ outcome, size: selectedSizes[index] }))
        .filter(({ outcome }) => outcome.status === "rejected");
      const successCountNow = outcomes.length - failedSizes.length;

      if (successCountNow > 0) {
        setSuccessCount(successCountNow);
        setSuccess(true);
      }

      if (failedSizes.length > 0) {
        setError(
          `לא נשלחה בקשה עבור מידות: ${failedSizes.map(({ size }) => size.size).join(", ")}`,
        );
      }
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
            className="animate-fade-scale-in w-full max-w-md rounded-[20px] bg-surface p-6 shadow-[0_24px_56px_-16px_rgba(34,31,31,0.35)]"
          >
            {success ? (
              <>
                <h2 id="interested-modal-title" className="text-lg font-bold text-ink">
                  הבקשה נשלחה!
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  {successCount > 1
                    ? `נשלחו ${successCount} בקשות עניין. `
                    : ""}
                  בעלת השמלה תקבל הודעה על ההתעניינות שלך. אפשר לעקוב אחרי
                  הסטטוס בעמוד &quot;הבקשות שלי&quot;.
                </p>
                {error && (
                  <div className="mt-3 rounded-2xl bg-warning-soft p-4 text-sm text-warning">
                    {error}
                  </div>
                )}
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
                    <div>
                      <p className="mb-2 text-xs font-bold text-ink-soft">
                        בחירת מידה (אפשר לבחור כמה מידות, וכמה יחידות מאותה
                        מידה):
                      </p>

                      {availabilityLoading ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {sizes.map((size) => (
                            <div
                              key={size.id}
                              className="h-[70px] animate-pulse rounded-xl bg-zinc-100"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {sizes.map((size) => {
                            const remaining = remainingUnitsForSelection(size);
                            const disabled = remaining <= 0;
                            const pickedCount = selectedCountFor(String(size.id));

                            return (
                              <button
                                key={size.id}
                                type="button"
                                onClick={() => addSizeToSelection(String(size.id))}
                                disabled={disabled}
                                className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-right transition ${
                                  pickedCount > 0
                                    ? "border-accent bg-accent-soft"
                                    : "border-line-strong hover:border-accent"
                                } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-strong`}
                              >
                                <span className="text-sm font-bold text-ink">
                                  מידה {size.size}
                                  {pickedCount > 0 && ` (נבחרו ${pickedCount})`}
                                </span>
                                <span className="text-sm font-semibold text-accent">
                                  {size.price} ₪
                                </span>
                                <span className="text-xs text-ink-faint">
                                  {disabled
                                    ? "אין יחידות פנויות"
                                    : remaining < size.quantity
                                      ? `נותרו ${remaining} מתוך ${size.quantity}`
                                      : `${size.quantity} יחידות זמינות`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {selectedSizes.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedSizes.map((size, index) => (
                            <span
                              key={`${size.id}-${index}`}
                              className="flex items-center gap-2 rounded-full bg-zinc-100 py-1.5 ps-3.5 pe-2 text-sm font-semibold text-zinc-700"
                            >
                              מידה {size.size} · {size.price} ₪
                              <button
                                type="button"
                                onClick={() => removeSizeFromSelection(index)}
                                aria-label={`הסרת מידה ${size.size} (בחירה ${index + 1})`}
                                className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {selectedSizes.length > 1 && (
                        <p className="mt-2 text-xs font-bold text-ink-soft">
                          סה&quot;כ: {totalPrice} ₪ ({selectedSizes.length} יחידות)
                        </p>
                      )}
                    </div>
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
