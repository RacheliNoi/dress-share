"use client";

import { FormEvent, useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import {
  ApiError,
  Booking,
  DressSize,
  cancelBooking,
  createInterestedBooking,
  createRentedBooking,
  getDressBookings,
  markBookingAsRented,
} from "@/lib/api";
import DressAvailabilityCalendar from "./DressAvailabilityCalendar";
import { getPeakUsageForRange } from "@/lib/availability";

const STATUS_BADGES: Partial<Record<Booking["status"], { label: string; className: string }>> = {
  INTERESTED: { label: "מישהו מתעניין", className: "bg-amber-100 text-amber-800" },
  RENTED: { label: "מושכר", className: "bg-rose-100 text-rose-700" },
  CANCELLED: { label: "בוטל", className: "bg-zinc-100 text-zinc-500" },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

// Reuses DressAvailabilityCalendar exactly as-is (unmodified) for the
// read-only visual grid - remounting it via `key` after every mutation is
// the whole refresh mechanism, so the public calendar component itself
// never needs to know an "owner mode" exists.
export default function DressAvailabilityManager({
  dressId,
  sizes,
}: {
  dressId: number;
  sizes: DressSize[];
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [calendarKey, setCalendarKey] = useState(0);

  const hasSizes = sizes.length > 0;

  const [newStatus, setNewStatus] = useState<"INTERESTED" | "RENTED">(
    "INTERESTED",
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Booking happens per-size, and the owner can hold several units in one
  // action - selectedSizeIds is an ordered MULTISET (duplicates allowed) of
  // DressSize ids: each entry represents exactly one intended physical
  // unit/Booking. quantity is inventory/capacity only - it is never treated
  // as "how many can be picked in one go" by itself, and a single Booking
  // never represents more than one unit (see handleCreate below, which
  // creates one request per entry here, never a Booking with a quantity).
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>([]);
  const [sizeToAdd, setSizeToAdd] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const selectedSizes = selectedSizeIds
    .map((id) => sizes.find((candidate) => String(candidate.id) === id))
    .filter((size): size is DressSize => Boolean(size));

  // Active (INTERESTED/RENTED) bookings for THIS dress, used to compute how
  // many units of each size are actually still free for the chosen date
  // range - mirrors the backend's day-by-day capacity check exactly (see
  // lib/availability.ts). This is UX only: the backend's SERIALIZABLE
  // capacity check on every submit is still the sole protection against
  // overselling, regardless of what this form shows.
  const activeBookings = bookings.filter(
    (booking) => booking.status === "INTERESTED" || booking.status === "RENTED",
  );
  const datesSelected = Boolean(startDate && endDate && endDate >= startDate);

  function selectedCountFor(sizeId: string) {
    return selectedSizeIds.filter((id) => id === sizeId).length;
  }

  // Units not already committed to an existing active booking - deliberately
  // ignores whatever the user has provisionally picked in this same form,
  // since that's not "occupied", just already claimed by this form. Used
  // only to drive the "already fully booked elsewhere" warning below.
  function existingRemainingUnits(size: DressSize): number {
    if (!datesSelected) {
      return size.quantity;
    }

    const { peakUsage, wholeDressBlocked } = getPeakUsageForRange(
      startDate,
      endDate,
      activeBookings,
      size.size,
    );

    if (wholeDressBlocked) {
      return 0;
    }

    return size.quantity - peakUsage;
  }

  // What actually drives the "add size" dropdown: existing bookings AND
  // this form's own already-selected units both count against quantity - a
  // size with quantity=3 and no existing bookings can be picked up to 3
  // times, but only once more if 2 units are already actively booked.
  // Recomputed from selectedSizeIds on every render (never cached), so
  // removing a selection immediately makes that unit pickable again.
  function remainingUnitsForSelection(size: DressSize): number {
    return existingRemainingUnits(size) - selectedCountFor(String(size.id));
  }

  const sizesAvailableToAdd = sizes.filter((size) => remainingUnitsForSelection(size) > 0);
  const sizesUnavailableForRange = datesSelected
    ? sizes.filter((size) => existingRemainingUnits(size) <= 0)
    : [];

  const [actioningId, setActioningId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  // Which INTERESTED row (if any) is currently showing its rent-confirmation
  // panel. The size itself is no longer picked here - it was already fixed
  // when the booking was created as INTERESTED (see the create-form below),
  // so confirming a rental just displays that locked-in size/price.
  const [rentingBookingId, setRentingBookingId] = useState<number | null>(
    null,
  );

  async function loadBookings() {
    const token = getToken();

    if (!token) {
      return;
    }

    try {
      setLoading(true);
      setLoadError("");

      const data = await getDressBookings(token, dressId);
      setBookings(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "לא הצלחנו לטעון את רשומות הזמינות. נסי שוב.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dressId]);

  function refreshAfterMutation() {
    loadBookings();
    setCalendarKey((key) => key + 1);
  }

  function addSizeToSelection(id: string) {
    // Intentionally no "already selected" guard - the same size can be
    // picked again as long as a unit remains (the dropdown itself only
    // offers a size while remainingUnitsForSelection > 0, so reaching here
    // with a maxed-out size shouldn't normally happen, but this stays
    // permissive rather than silently dropping a legitimate pick).
    if (!id) {
      return;
    }

    setSelectedSizeIds((current) => [...current, id]);
    setSizeToAdd("");
  }

  // Removes exactly ONE selected unit at the given index - not "all
  // selections of this size" - since the same size can now appear multiple
  // times in selectedSizeIds (once per unit).
  function removeSizeFromSelection(index: number) {
    setSelectedSizeIds((current) => current.filter((_, current_) => current_ !== index));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();

    if (!token || !startDate || !endDate) {
      return;
    }

    if (endDate < startDate) {
      setCreateError("תאריך הסיום לא יכול להיות לפני תאריך ההתחלה");
      return;
    }

    if (hasSizes && selectedSizes.length === 0) {
      setCreateError("יש לבחור לפחות מידה אחת");
      return;
    }

    setCreating(true);
    setCreateError("");

    try {
      if (!hasSizes) {
        // No DressSize rows for this dress - single, size-less booking,
        // exactly like before per-size tracking existed.
        await createInterestedBooking(token, { dressId, startDate, endDate });
      } else {
        // One booking per selected size, submitted together. Independent
        // sizes never conflict with each other, so these can run in
        // parallel; a per-size failure (e.g. one size already taken for
        // this range) doesn't block the others from being created.
        const outcomes = await Promise.allSettled(
          selectedSizes.map((size) =>
            newStatus === "INTERESTED"
              ? createInterestedBooking(token, {
                  dressId,
                  startDate,
                  endDate,
                  size: size.size,
                })
              : createRentedBooking(token, {
                  dressId,
                  startDate,
                  endDate,
                  // price is always the exact DressSize price - never a
                  // free-typed number.
                  size: size.size,
                  price: size.price,
                }),
          ),
        );

        const failedSizes = outcomes
          .map((outcome, index) => ({ outcome, size: selectedSizes[index] }))
          .filter(({ outcome }) => outcome.status === "rejected");

        if (failedSizes.length > 0) {
          setCreateError(
            `לא נוצרה רשומה עבור מידות: ${failedSizes
              .map(({ size }) => size.size)
              .join(", ")}`,
          );
        }
      }

      setStartDate("");
      setEndDate("");
      setSelectedSizeIds([]);
      refreshAfterMutation();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "שגיאה ביצירת הרשומה",
      );
    } finally {
      setCreating(false);
    }
  }

  function openRentForm(bookingId: number) {
    setRentingBookingId(bookingId);
    setActionError("");
  }

  function cancelRentForm() {
    setRentingBookingId(null);
  }

  async function handleConfirmRent(bookingId: number) {
    const token = getToken();

    if (!token) {
      return;
    }

    setActioningId(bookingId);
    setActionError("");

    try {
      // size/price are intentionally omitted - the backend locks the size
      // to whatever was chosen when this booking was created as INTERESTED,
      // and derives the price from that size's current DressSize row.
      await markBookingAsRented(token, bookingId, {});
      setRentingBookingId(null);
      refreshAfterMutation();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "שגיאה בעדכון הרשומה",
      );
    } finally {
      setActioningId(null);
    }
  }

  async function handleCancel(bookingId: number) {
    const token = getToken();

    if (!token) {
      return;
    }

    const confirmed = window.confirm("לבטל את הרשומה?");

    if (!confirmed) {
      return;
    }

    setActioningId(bookingId);
    setActionError("");

    try {
      await cancelBooking(token, bookingId);
      refreshAfterMutation();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "שגיאה בביטול הרשומה",
      );
    } finally {
      setActioningId(null);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <DressAvailabilityCalendar dressId={dressId} sizes={sizes} key={calendarKey} />

      <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200/60 sm:p-6">
        <h2 className="text-lg font-bold text-zinc-900">ניהול זמינות</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {hasSizes
            ? 'סמני טווח תאריכים כ"מישהו מתעניין" או כ"מושכר" - אפשר לבחור כמה מידות בבת אחת.'
            : 'סמני טווח תאריכים כ"מישהו מתעניין" או כ"מושכר".'}
        </p>

        <form onSubmit={handleCreate} className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setNewStatus("INTERESTED")}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                newStatus === "INTERESTED"
                  ? "bg-amber-500 text-white"
                  : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              מישהו מתעניין
            </button>
            <button
              type="button"
              onClick={() => setNewStatus("RENTED")}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                newStatus === "RENTED"
                  ? "bg-rose-500 text-white"
                  : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              מושכר
            </button>
          </div>

          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
            aria-label="תאריך התחלה"
            className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
          />

          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            required
            aria-label="תאריך סיום"
            className="rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
          />

          {hasSizes ? (
            <div className="sm:col-span-2">
                <select
                  value={sizeToAdd}
                  onChange={(event) => addSizeToSelection(event.target.value)}
                  aria-label="הוספת מידה"
                  disabled={sizesAvailableToAdd.length === 0}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <option value="">
                    {sizesAvailableToAdd.length === 0
                      ? datesSelected && sizesUnavailableForRange.length > 0
                        ? "אין מידות פנויות בטווח שנבחר"
                        : "כל היחידות הזמינות כבר נבחרו"
                      : "הוספת מידה..."}
                  </option>
                  {sizesAvailableToAdd.map((size) => {
                    const remaining = remainingUnitsForSelection(size);

                    return (
                      <option key={size.id} value={size.id}>
                        מידה {size.size} · {size.price} ₪
                        {remaining < size.quantity ? ` · נותרו ${remaining}` : ` · ${size.quantity} יחידות`}
                      </option>
                    );
                  })}
                </select>

                {sizesUnavailableForRange.length > 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    תפוסות בטווח התאריכים שנבחר (כל היחידות תפוסות):{" "}
                    {sizesUnavailableForRange.map((size) => size.size).join(", ")}
                  </p>
                )}

                {selectedSizes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSizes.map((size, index) => (
                      <span
                        key={`${size.id}-${index}`}
                        className="flex items-center gap-2 rounded-full bg-zinc-100 py-1.5 ps-3.5 pe-2 text-sm font-semibold text-zinc-700"
                      >
                        מידה {size.size}
                        {newStatus === "RENTED" && ` · ${size.price} ₪`}
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

                {newStatus === "RENTED" && (
                  <p className="mt-2 text-xs text-zinc-400">
                    המחיר לכל מידה נקבע אוטומטית לפי המחיר שהוגדר לה.
                  </p>
                )}
            </div>
          ) : (
            newStatus === "RENTED" && (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 sm:col-span-2">
                לא ניתן לסמן את השמלה כמושכרת לפני שמוגדרות לה מידות
                ומחירים. הוסיפי מידות בעמוד העריכה של השמלה.
              </div>
            )
          )}

          {createError && (
            <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 sm:col-span-2">
              {createError}
            </div>
          )}

          <button
            type="submit"
            disabled={
              creating ||
              !startDate ||
              !endDate ||
              (newStatus === "RENTED" && !hasSizes) ||
              (hasSizes && selectedSizes.length === 0)
            }
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
          >
            {creating
              ? "שומרת..."
              : selectedSizes.length > 1
                ? `הוספת ${selectedSizes.length} רשומות`
                : "הוספת רשומה"}
          </button>
        </form>
      </div>

      <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200/60 sm:p-6">
        <h2 className="text-lg font-bold text-zinc-900">רשומות זמינות</h2>

        {actionError && (
          <div className="mt-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="mt-4 space-y-2">
            {[1, 2].map((item) => (
              <div
                key={item}
                className="h-14 animate-pulse rounded-xl bg-zinc-100"
              />
            ))}
          </div>
        ) : loadError ? (
          <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={loadBookings}
              className="font-bold underline underline-offset-4"
            >
              נסי שוב
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">
            עדיין אין רשומות זמינות לשמלה זו.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {bookings.map((booking) => {
              const badge = STATUS_BADGES[booking.status] ?? {
                label: booking.status,
                className: "bg-zinc-100 text-zinc-500",
              };

              const isRentingThis = rentingBookingId === booking.id;
              const matchingSize = sizes.find(
                (size) => size.size === booking.size,
              );

              return (
                <li key={booking.id} className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {booking.size && (
                          <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                            מידה {booking.size}
                          </span>
                        )}
                      </div>

                      {/* dir="ltr" pins the digit order - without it, the
                          Unicode bidi algorithm can visually swap the two
                          LTR date runs around the "–" inside this RTL page,
                          even though the underlying text is already correct. */}
                      <p dir="ltr" className="mt-1.5 text-right text-sm text-zinc-700">
                        {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
                      </p>
                    </div>

                    {booking.status === "INTERESTED" && !isRentingThis && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openRentForm(booking.id)}
                          disabled={actioningId === booking.id || !hasSizes}
                          title={
                            hasSizes
                              ? undefined
                              : "יש להגדיר מידות ומחירים לשמלה לפני השכרה"
                          }
                          className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          הפוך למושכר
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCancel(booking.id)}
                          disabled={actioningId === booking.id}
                          className="rounded-xl border border-red-200 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          ביטול
                        </button>
                      </div>
                    )}

                    {booking.status === "RENTED" && (
                      <button
                        type="button"
                        onClick={() => handleCancel(booking.id)}
                        disabled={actioningId === booking.id}
                        className="self-start rounded-xl border border-red-200 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
                      >
                        ביטול השכרה
                      </button>
                    )}
                  </div>

                  {booking.status === "INTERESTED" && isRentingThis && (
                    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      {!hasSizes ? (
                        <p className="text-sm font-medium text-amber-700">
                          לא ניתן לסמן את השמלה כמושכרת לפני שמוגדרות לה מידות
                          ומחירים. הוסיפי מידות בעמוד העריכה של השמלה.
                        </p>
                      ) : !booking.size || !matchingSize ? (
                        <p className="text-sm font-medium text-amber-700">
                          לא ניתן להשלים את ההשכרה - למידה שנבחרה בהתעניינות
                          אין (עוד) הגדרת מחיר תקפה עבור שמלה זו.
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-zinc-700">
                            מידה: <span className="font-bold">{matchingSize.size}</span>{" "}
                            · מחיר: <span className="font-bold">{matchingSize.price} ₪</span>
                          </p>
                          <p className="mt-1 text-xs text-zinc-400">
                            המידה נקבעה כשההתעניינות נוצרה ולא ניתנת לשינוי בשלב זה.
                          </p>

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirmRent(booking.id)}
                              disabled={actioningId === booking.id}
                              className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              אישור השכרה
                            </button>
                            <button
                              type="button"
                              onClick={cancelRentForm}
                              disabled={actioningId === booking.id}
                              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              ביטול
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
