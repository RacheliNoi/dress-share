"use client";

import { FormEvent, useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import {
  ApiError,
  Booking,
  DressAvailabilityBlock,
  DressSize,
  cancelBooking,
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  getDressAvailabilityBlocks,
  getDressBookings,
  markBookingAsRented,
} from "@/lib/api";
import DressAvailabilityCalendar from "./DressAvailabilityCalendar";
import BookingChat from "./BookingChat";
import ConfirmDialog from "./ui/ConfirmDialog";

const STATUS_BADGES: Partial<Record<Booking["status"], { label: string; className: string }>> = {
  INTERESTED: { label: "מישהו מתעניין", className: "bg-warning-soft text-warning" },
  RENTED: { label: "מושכר", className: "bg-accent-soft text-accent-deep" },
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
// never needs to know an "owner mode" exists. It also renders
// DressAvailabilityBlocks automatically - the backend folds them into the
// same availability feed this calendar already reads, so no change was
// needed here to make blocked dates show as taken.
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

  const [actioningId, setActioningId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [pendingCancelId, setPendingCancelId] = useState<number | null>(null);

  // Which INTERESTED row (if any) is currently showing its rent-confirmation
  // panel. The size was already fixed when the booking was created as
  // INTERESTED (by the renter, on the public dress page), so confirming a
  // rental just displays that locked-in size/price.
  const [rentingBookingId, setRentingBookingId] = useState<number | null>(
    null,
  );
  const [openChatId, setOpenChatId] = useState<number | null>(null);

  const [blocks, setBlocks] = useState<DressAvailabilityBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [blockStartDate, setBlockStartDate] = useState("");
  const [blockEndDate, setBlockEndDate] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [creatingBlock, setCreatingBlock] = useState(false);
  const [blockError, setBlockError] = useState("");
  const [deletingBlockId, setDeletingBlockId] = useState<number | null>(null);

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
          : "לא הצלחנו לטעון את ההזמנות. נסי שוב.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadBlocks() {
    const token = getToken();

    if (!token) {
      return;
    }

    try {
      setBlocksLoading(true);
      const data = await getDressAvailabilityBlocks(token, dressId);
      setBlocks(data);
    } catch {
      // Non-critical read (the blocks list itself, not the calendar) - a
      // failure here just means the management list below stays empty;
      // the calendar's own availability fetch is independent of this call.
    } finally {
      setBlocksLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
    loadBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dressId]);

  function refreshAfterMutation() {
    loadBookings();
    setCalendarKey((key) => key + 1);
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
        err instanceof ApiError ? err.message : "שגיאה בעדכון ההזמנה",
      );
    } finally {
      setActioningId(null);
    }
  }

  function handleCancel(bookingId: number) {
    setPendingCancelId(bookingId);
  }

  async function confirmCancel() {
    const token = getToken();
    const bookingId = pendingCancelId;

    if (!token || bookingId === null) {
      setPendingCancelId(null);
      return;
    }

    setActioningId(bookingId);
    setActionError("");

    try {
      await cancelBooking(token, bookingId);
      refreshAfterMutation();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "שגיאה בביטול ההזמנה",
      );
    } finally {
      setActioningId(null);
      setPendingCancelId(null);
    }
  }

  async function handleCreateBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();

    if (!token || !blockStartDate || !blockEndDate) {
      return;
    }

    if (blockEndDate < blockStartDate) {
      setBlockError("תאריך הסיום לא יכול להיות לפני תאריך ההתחלה");
      return;
    }

    setCreatingBlock(true);
    setBlockError("");

    try {
      await createAvailabilityBlock(token, dressId, {
        startDate: blockStartDate,
        endDate: blockEndDate,
        reason: blockReason.trim() || undefined,
      });
      setBlockStartDate("");
      setBlockEndDate("");
      setBlockReason("");
      loadBlocks();
      setCalendarKey((key) => key + 1);
    } catch (err) {
      setBlockError(
        err instanceof ApiError ? err.message : "שגיאה בחסימת התאריך",
      );
    } finally {
      setCreatingBlock(false);
    }
  }

  async function handleDeleteBlock(blockId: number) {
    const token = getToken();

    if (!token) {
      return;
    }

    setDeletingBlockId(blockId);

    try {
      await deleteAvailabilityBlock(token, blockId);
      loadBlocks();
      setCalendarKey((key) => key + 1);
    } catch (err) {
      setBlockError(
        err instanceof ApiError ? err.message : "שגיאה בהסרת החסימה",
      );
    } finally {
      setDeletingBlockId(null);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <DressAvailabilityCalendar dressId={dressId} sizes={sizes} key={calendarKey} />

      <div className="rounded-[20px] bg-white p-5 shadow-sm ring-1 ring-line sm:p-6">
        <h2 className="font-display text-lg font-semibold text-zinc-900">בקשות נכנסות</h2>
        <p className="mt-1 text-sm text-zinc-500">
          שוכרות שסימנו עניין בשמלה שלך מופיעות כאן - אפשר לענות לצ&apos;אט
          שלהן ולאשר השכרה.
        </p>

        {actionError && (
          <div className="mt-3 rounded-2xl bg-error-soft p-4 text-sm text-error">
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
          <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl bg-error-soft p-4 text-sm text-error sm:flex-row sm:items-center sm:justify-between">
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
            עדיין לא הגיעו בקשות לשמלה זו.
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
              // Same status-as-spine device already established on the "My
              // Dresses" cards - reused here, not reinvented, so the two
              // screens share one visual language for status.
              const spineColor =
                booking.status === "RENTED"
                  ? "bg-accent"
                  : booking.status === "INTERESTED"
                    ? "bg-warning"
                    : "bg-line-strong";

              return (
                <li key={booking.id} className="flex gap-3 py-4">
                  <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-full ${spineColor}`} />

                  <div className="min-w-0 flex-1">
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
                        <p dir="ltr" className="mt-1.5 text-right text-sm font-semibold text-ink">
                          {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
                        </p>

                        {booking.renterId !== null && (
                          <button
                            type="button"
                            onClick={() =>
                              setOpenChatId((current) => (current === booking.id ? null : booking.id))
                            }
                            className="mt-1.5 text-xs font-bold text-accent underline underline-offset-4"
                          >
                            {openChatId === booking.id ? "סגירת הצ'אט" : "צ'אט עם השוכרת"}
                          </button>
                        )}
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
                            הפכי למושכר
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCancel(booking.id)}
                            disabled={actioningId === booking.id}
                            className="rounded-xl border border-error-soft px-4 py-2 text-xs font-bold text-error transition hover:bg-error-soft disabled:cursor-not-allowed disabled:opacity-50"
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
                          className="self-start rounded-xl border border-error-soft px-4 py-2 text-xs font-bold text-error transition hover:bg-error-soft disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
                        >
                          ביטול השכרה
                        </button>
                      )}
                    </div>

                    {booking.status === "INTERESTED" && isRentingThis && (
                      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        {!hasSizes ? (
                          <p className="text-sm font-medium text-warning">
                            לא ניתן לסמן את השמלה כמושכרת לפני שמוגדרות לה מידות
                            ומחירים. הוסיפי מידות בעמוד העריכה של השמלה.
                          </p>
                        ) : !booking.size || !matchingSize ? (
                          <p className="text-sm font-medium text-warning">
                            לא ניתן להשלים את ההשכרה - למידה שנבחרה בהתעניינות
                            עדיין אין הגדרת מחיר תקפה עבור שמלה זו.
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

                    {openChatId === booking.id && (
                      <div className="mt-3">
                        <BookingChat bookingId={booking.id} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-[20px] bg-white p-5 shadow-sm ring-1 ring-line sm:p-6">
        <h2 className="font-display text-lg font-semibold text-zinc-900">חסימת תאריכים</h2>
        <p className="mt-1 text-sm text-zinc-500">
          יש לך את השמלה בניקוי או בשימוש אישי? חסמי טווח תאריכים כדי שלא
          יופיע כפנוי בלוח.
        </p>

        <form onSubmit={handleCreateBlock} className="mt-5 grid gap-3 sm:grid-cols-2">
          <input
            type="date"
            value={blockStartDate}
            onChange={(event) => setBlockStartDate(event.target.value)}
            required
            aria-label="תאריך התחלה לחסימה"
            className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
          />

          <input
            type="date"
            value={blockEndDate}
            onChange={(event) => setBlockEndDate(event.target.value)}
            required
            aria-label="תאריך סיום לחסימה"
            className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
          />

          <input
            type="text"
            value={blockReason}
            onChange={(event) => setBlockReason(event.target.value)}
            placeholder="סיבה (לא חובה)"
            aria-label="סיבת החסימה"
            className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft sm:col-span-2"
          />

          {blockError && (
            <div className="rounded-2xl bg-error-soft p-4 text-sm text-error sm:col-span-2">
              {blockError}
            </div>
          )}

          <button
            type="submit"
            disabled={creatingBlock || !blockStartDate || !blockEndDate}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
          >
            {creatingBlock ? "חוסמת..." : "חסימת התאריכים"}
          </button>
        </form>

        {blocksLoading ? (
          <div className="mt-4 h-10 animate-pulse rounded-xl bg-zinc-100" />
        ) : blocks.length > 0 ? (
          <ul className="mt-5 divide-y divide-zinc-100">
            {blocks.map((block) => (
              <li key={block.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p dir="ltr" className="text-right text-sm font-semibold text-ink">
                    {formatDate(block.startDate)} – {formatDate(block.endDate)}
                  </p>
                  {block.reason && (
                    <p className="mt-0.5 text-xs text-zinc-500">{block.reason}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteBlock(block.id)}
                  disabled={deletingBlockId === block.id}
                  className="rounded-xl border border-error-soft px-4 py-2 text-xs font-bold text-error transition hover:bg-error-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  הסרת חסימה
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingCancelId !== null}
        title="לבטל את ההזמנה?"
        confirmLabel="ביטול ההזמנה"
        cancelLabel="חזרה"
        danger
        loading={actioningId === pendingCancelId}
        onConfirm={confirmCancel}
        onCancel={() => setPendingCancelId(null)}
      />
    </section>
  );
}
