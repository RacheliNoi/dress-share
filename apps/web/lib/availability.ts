// Quantity-aware availability helpers shared by every frontend surface that
// needs to answer "is this size available" - the single-dress calendar, the
// catalog's date filter, and the owner's booking-creation form. Keeping this
// logic in one place (rather than reimplemented per-component) is what
// keeps the frontend from ever showing a size as available when the backend
// would reject it, or vice versa: it mirrors bookings.service.ts's
// assertCapacityAvailable algorithm exactly, including the day-by-day peak
// usage check (not a naive count of overlapping bookings, which would
// over-reject once quantity > 1 and existing bookings are staggered - see
// the stage report) and the "a size: null entry blocks every size" rule for
// legacy/no-size-dress bookings.

export type AvailabilityBooking = {
  startDate: string;
  endDate: string;
  size: string | null;
};

function coversDay(startDate: string, endDate: string, day: Date): boolean {
  const time = day.getTime();
  return new Date(startDate).getTime() <= time && new Date(endDate).getTime() >= time;
}

export function getSizeUsageForDay(
  day: Date,
  bookings: AvailabilityBooking[],
  size: string,
): { usage: number; wholeDressBlocked: boolean } {
  let usage = 0;
  let wholeDressBlocked = false;

  for (const booking of bookings) {
    if (!coversDay(booking.startDate, booking.endDate, day)) {
      continue;
    }

    if (booking.size === null) {
      wholeDressBlocked = true;
    } else if (booking.size === size) {
      usage += 1;
    }
  }

  return { usage, wholeDressBlocked };
}

export function isSizeAvailableOnDay(
  day: Date,
  bookings: AvailabilityBooking[],
  size: string,
  quantity: number,
): boolean {
  const { usage, wholeDressBlocked } = getSizeUsageForDay(day, bookings, size);
  return !wholeDressBlocked && usage < quantity;
}

// Day-by-day walk across a [startDate, endDate] range (inclusive, UTC) -
// mirrors the backend's assertCapacityAvailable exactly. Returns the PEAK
// concurrent usage across every day in the range (not just a yes/no
// answer), so callers that need to know how many units are actually left -
// e.g. to subtract units a user has already provisionally picked in an
// in-progress form, before anything is submitted - can do that arithmetic
// themselves rather than only getting a boolean.
export function getPeakUsageForRange(
  startDate: string,
  endDate: string,
  bookings: AvailabilityBooking[],
  size: string,
): { peakUsage: number; wholeDressBlocked: boolean } {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  let peakUsage = 0;
  let wholeDressBlocked = false;

  for (
    let day = new Date(start);
    day.getTime() <= end.getTime();
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const dayResult = getSizeUsageForDay(day, bookings, size);

    if (dayResult.wholeDressBlocked) {
      wholeDressBlocked = true;
    }

    peakUsage = Math.max(peakUsage, dayResult.usage);
  }

  return { peakUsage, wholeDressBlocked };
}

// A size is available for the whole range only if at least one unit is free
// on EVERY day in it - built on getPeakUsageForRange so the day-by-day walk
// exists in exactly one place.
export function isSizeAvailableForRange(
  startDate: string,
  endDate: string,
  bookings: AvailabilityBooking[],
  size: string,
  quantity: number,
): boolean {
  const { peakUsage, wholeDressBlocked } = getPeakUsageForRange(
    startDate,
    endDate,
    bookings,
    size,
  );

  return !wholeDressBlocked && peakUsage < quantity;
}
