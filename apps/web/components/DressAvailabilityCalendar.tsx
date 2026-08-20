"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  DressAvailabilityEntry,
  DressSize,
  getDressAvailability,
} from "@/lib/api";
import { getHebrewDateLabel } from "@/lib/hebrewDate";
import { getSizeUsageForDay } from "@/lib/availability";

const WEEKDAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

type DayStatus = "RENTED" | "INTERESTED" | "FREE";

type CalendarCell = {
  date: Date;
  inCurrentMonth: boolean;
  status: DayStatus;
};

function startOfUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1));
}

// Booking dates arrive as UTC-midnight-anchored date-only values (matching
// the backend's inclusive-both-ends semantics). All grid/comparison math
// here is done in UTC components on purpose, so the calendar can't drift by
// a day depending on the viewer's local timezone.
function buildCalendarGrid(
  monthDate: Date,
  availability: DressAvailabilityEntry[],
): CalendarCell[] {
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();

  const firstOfMonth = startOfUtcMonth(year, month);
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const ranges = availability.map((entry) => ({
    start: new Date(entry.startDate),
    end: new Date(entry.endDate),
    status: entry.status,
  }));

  function statusFor(date: Date): DayStatus {
    const time = date.getTime();
    let interested = false;

    for (const range of ranges) {
      if (time >= range.start.getTime() && time <= range.end.getTime()) {
        if (range.status === "RENTED") {
          return "RENTED";
        }
        interested = true;
      }
    }

    return interested ? "INTERESTED" : "FREE";
  }

  const cells: CalendarCell[] = [];

  for (let i = 0; i < startWeekday; i++) {
    const date = new Date(Date.UTC(year, month, 1 - (startWeekday - i)));
    cells.push({ date, inCurrentMonth: false, status: statusFor(date) });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month, day));
    cells.push({ date, inCurrentMonth: true, status: statusFor(date) });
  }

  while (cells.length % 7 !== 0) {
    const lastDate = cells[cells.length - 1].date;
    const date = new Date(lastDate);
    date.setUTCDate(date.getUTCDate() + 1);
    cells.push({ date, inCurrentMonth: false, status: statusFor(date) });
  }

  return cells;
}

const monthFormatter = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// Per-size, quantity-aware breakdown for one calendar day - computed on
// demand (only when a day is clicked open), never baked into the grid's own
// background color, which intentionally keeps showing the dress's overall
// worst-case status exactly as before. Mirrors the backend's
// assertCapacityAvailable via the shared getSizeUsageForDay helper, so this
// panel can never disagree with what the backend would actually accept for
// this exact day. `size: null` on an entry means either a no-size dress
// (whole-dress booking, unchanged legacy behavior) or a booking made before
// per-size tracking existed - both are treated as blocking every size, the
// conservative reading.
function sizeBreakdownForDate(
  date: Date,
  availability: DressAvailabilityEntry[],
  sizes: DressSize[],
): { available: string[]; blocked: string[]; wholeDressBlocked: boolean } {
  let wholeDressBlocked = false;
  const available: string[] = [];
  const blocked: string[] = [];

  for (const size of sizes) {
    const { usage, wholeDressBlocked: dayFullyBlocked } = getSizeUsageForDay(
      date,
      availability,
      size.size,
    );

    if (dayFullyBlocked) {
      wholeDressBlocked = true;
    }

    if (dayFullyBlocked || usage >= size.quantity) {
      blocked.push(size.size);
    } else {
      available.push(size.size);
    }
  }

  if (wholeDressBlocked) {
    return { available: [], blocked: sizes.map((size) => size.size), wholeDressBlocked: true };
  }

  return { available, blocked, wholeDressBlocked: false };
}

function isSameUtcDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// Parses an <input type="date"> value ("YYYY-MM-DD") as a UTC-midnight Date,
// matching how the rest of this component treats calendar days.
function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

const STATUS_CELL_CLASSES: Record<DayStatus, string> = {
  FREE: "bg-white text-zinc-700 ring-1 ring-zinc-200/70",
  INTERESTED: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  RENTED: "bg-rose-500 text-white",
};

export default function DressAvailabilityCalendar({
  dressId,
  sizes = [],
}: {
  dressId: number;
  sizes?: DressSize[];
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState<DressAvailabilityEntry[]>(
    [],
  );
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return startOfUtcMonth(today.getFullYear(), today.getMonth());
  });
  const [jumpValue, setJumpValue] = useState("");
  const [highlightedDate, setHighlightedDate] = useState<Date | null>(null);
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const hasSizes = sizes.length > 0;

  async function loadAvailability() {
    try {
      setLoading(true);
      setError("");

      const data = await getDressAvailability(dressId);
      setAvailability(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "לא הצלחנו לטעון את נתוני הזמינות. נסי שוב.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dressId]);

  const cells = useMemo(
    () => buildCalendarGrid(currentMonth, availability),
    [currentMonth, availability],
  );

  function goToPreviousMonth() {
    setCurrentMonth(
      (current) =>
        new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)),
    );
  }

  function goToNextMonth() {
    setCurrentMonth(
      (current) =>
        new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1)),
    );
  }

  function handleJumpToDate(value: string) {
    setJumpValue(value);

    const parsed = parseDateInputValue(value);

    if (!parsed) {
      return;
    }

    setCurrentMonth(startOfUtcMonth(parsed.getUTCFullYear(), parsed.getUTCMonth()));
    setHighlightedDate(parsed);
  }

  return (
    <section className="mt-8 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-zinc-200/60 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-zinc-900">זמינות</h2>
      </div>

      {loading ? (
        <div className="mt-5 space-y-3">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-zinc-100" />
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {Array.from({ length: 35 }).map((_, index) => (
              <div
                key={index}
                className="aspect-square animate-pulse rounded-lg bg-zinc-100"
              />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="mt-5 flex flex-col items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadAvailability}
            className="font-bold underline underline-offset-4"
          >
            נסי שוב
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={goToPreviousMonth}
              aria-label="חודש קודם"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              →
            </button>

            <span className="text-sm font-bold text-zinc-900 sm:text-base">
              {monthFormatter.format(currentMonth)}
            </span>

            <button
              type="button"
              onClick={goToNextMonth}
              aria-label="חודש הבא"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              ←
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <label htmlFor={`jump-to-date-${dressId}`} className="text-xs font-bold text-zinc-500">
              קפיצה לתאריך:
            </label>
            <input
              id={`jump-to-date-${dressId}`}
              type="date"
              value={jumpValue}
              onChange={(event) => handleJumpToDate(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 sm:w-auto"
            />
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-zinc-400 sm:gap-2 sm:text-xs">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="mt-1.5 grid grid-cols-7 gap-1.5 sm:gap-2">
            {cells.map((cell) => {
              const isHighlighted =
                highlightedDate !== null && isSameUtcDay(cell.date, highlightedDate);
              const isSelectedForDetail =
                detailDate !== null && isSameUtcDay(cell.date, detailDate);

              return (
                <button
                  key={cell.date.toISOString()}
                  type="button"
                  onClick={() =>
                    hasSizes &&
                    setDetailDate((current) =>
                      current && isSameUtcDay(current, cell.date) ? null : cell.date,
                    )
                  }
                  className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-semibold sm:text-sm ${
                    STATUS_CELL_CLASSES[cell.status]
                  } ${cell.inCurrentMonth ? "" : "opacity-35"} ${
                    isHighlighted ? "ring-2 ring-sky-500 ring-offset-2" : ""
                  } ${isSelectedForDetail ? "ring-2 ring-zinc-900 ring-offset-2" : ""} ${
                    hasSizes ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span>{cell.date.getUTCDate()}</span>
                  <span className="text-[8px] font-normal leading-none opacity-80 sm:text-[10px]">
                    {getHebrewDateLabel(cell.date)}
                  </span>
                </button>
              );
            })}
          </div>

          {hasSizes && detailDate && (
            <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-700 sm:text-sm">
              {(() => {
                const breakdown = sizeBreakdownForDate(detailDate, availability, sizes);
                const dateLabel = `${detailDate.getUTCDate()}/${
                  detailDate.getUTCMonth() + 1
                } (${getHebrewDateLabel(detailDate)})`;

                if (breakdown.available.length === 0) {
                  return <p>בתאריך {dateLabel}: כל המידות תפוסות.</p>;
                }

                if (breakdown.blocked.length === 0) {
                  return <p>בתאריך {dateLabel}: כל המידות פנויות.</p>;
                }

                return (
                  <p>
                    בתאריך {dateLabel}: מידות פנויות – {breakdown.available.join(", ")} · מידות
                    תפוסות – {breakdown.blocked.join(", ")}
                  </p>
                );
              })()}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded ring-1 ring-zinc-200/70" />
              פנוי
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-200" />
              מישהו מתעניין
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-rose-500" />
              מושכר
            </div>
          </div>
        </>
      )}
    </section>
  );
}
