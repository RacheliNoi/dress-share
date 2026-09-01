import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, DressStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';

// Only these two statuses represent a dress actually being held for its
// date range. CANCELLED is intentionally excluded so a cancelled booking
// frees up its dates (and never consumes a unit of quantity). The legacy
// PENDING/CONFIRMED/COMPLETED values predate this stage, have no code path
// that ever creates them, and are left out on purpose rather than guessing
// behavior for them - see the stage report.
const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.INTERESTED,
  BookingStatus.RENTED,
];

// How long an INTERESTED hold (fitting-coordination phase, not yet a
// confirmed rental) is allowed to sit before it's treated as abandoned and
// released back into the calendar. Same "plain tunable constant" pattern as
// RESET_TOKEN_TTL_MINUTES/PASSWORD_MIN_LENGTH in auth.service.ts, not an env
// var - this is a business rule, not per-environment config.
export const INTERESTED_EXPIRY_DAYS = 7;

function addUtcDay(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDate(value: unknown, label: string): Date {
    if (value === undefined || value === null || value === '') {
      throw new BadRequestException(`יש לספק ${label}`);
    }

    const date = new Date(value as string);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} אינו תאריך תקין`);
    }

    return date;
  }

  private assertValidRange(startDate: Date, endDate: Date) {
    if (endDate < startDate) {
      throw new BadRequestException(
        'תאריך הסיום לא יכול להיות לפני תאריך ההתחלה',
      );
    }
  }

  private async loadOwnedDress(dressId: number, ownerId: number) {
    const dress = await this.prisma.dress.findUnique({
      where: { id: dressId },
      // Bookable sizes are the currently-live ones (pendingAction: null)
      // plus any flagged for removal by an in-review edit (REMOVE) - nothing
      // changes publicly/bookably until that edit is actually approved.
      // Sizes proposed by an in-review edit (ADD) aren't real/bookable yet.
      include: {
        sizes: { where: { OR: [{ pendingAction: null }, { pendingAction: 'REMOVE' }] } },
      },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.ownerId !== ownerId) {
      throw new ForbiddenException(
        'אין הרשאה לנהל את הזמינות של השמלה הזו',
      );
    }

    return dress;
  }

  // Same lookup as loadOwnedDress, minus the ownership check - used by
  // createInterested, which any authenticated renter (not just the dress's
  // owner) can now call. Kept as a separate method rather than adding a
  // "skip the check" flag to loadOwnedDress, so every other caller of
  // loadOwnedDress keeps its ownership guarantee with zero risk of it being
  // accidentally bypassed.
  private async loadBookableDress(dressId: number) {
    const dress = await this.prisma.dress.findUnique({
      where: { id: dressId },
      include: {
        sizes: { where: { OR: [{ pendingAction: null }, { pendingAction: 'REMOVE' }] } },
      },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    return dress;
  }

  // A dress with zero DressSize rows keeps the original, size-blind
  // behavior entirely untouched (no size required, no validation against a
  // size list that doesn't exist, whole-dress overlap blocking) - see the
  // stage report for why this is a deliberate "don't invent behavior for
  // dresses with no sizes" decision rather than an oversight.
  private assertSizeSelection(
    dress: { sizes: { size: string }[] },
    size: string | undefined,
  ) {
    const sizes = dress.sizes ?? [];

    if (sizes.length === 0) {
      return;
    }

    if (!size) {
      throw new BadRequestException('יש לבחור מידה עבור שמלה זו');
    }

    if (!sizes.some((candidate) => candidate.size === size)) {
      throw new BadRequestException('המידה שנבחרה אינה קיימת עבור שמלה זו');
    }
  }

  private assertDressBookable(dress: { status: DressStatus }) {
    if (dress.status !== DressStatus.APPROVED) {
      throw new BadRequestException(
        'ניתן ליצור או לעדכן הזמנה רק עבור שמלה מאושרת',
      );
    }
  }

  // Two date ranges overlap iff each range's start is not after the other's
  // end - i.e. they share at least one calendar day (inclusive of both
  // endpoints). This matches the stage-1 decision to allow startDate ===
  // endDate as a valid single-day hold: under exclusive-end semantics that
  // would be a zero-length range, which contradicts treating it as real
  // occupancy. One consequence worth knowing: a booking ending on day X and
  // another starting on day X are treated as overlapping (no same-day
  // turnover) - the conservative, safe default carried forward from earlier
  // stages.
  //
  // When `size` is omitted (no DressSize rows for this dress), this is a
  // whole-dress, single-implicit-unit existence check - byte-for-byte the
  // original overlap behavior from before per-size tracking existed.
  //
  // When `size` + `quantity` are given, this walks day-by-day through the
  // requested range and counts how many *other* active bookings for that
  // exact size cover each day, rejecting only if some day's usage would
  // reach `quantity`. This is deliberately NOT "count of bookings whose
  // range overlaps the request" - once quantity > 1, two existing bookings
  // for the same size can each overlap the requested range without ever
  // being concurrent with each other (e.g. one ending before the other
  // starts), so a naive overlap-count would over-reject valid requests. Any
  // active booking with size: null (legacy data, or a booking made while
  // the dress had no sizes) is treated as consuming every unit of every
  // size on the days it covers - the same conservative "unknown size blocks
  // everything" rule used everywhere else in this codebase.
  private async assertCapacityAvailable(
    tx: Prisma.TransactionClient,
    dressId: number,
    startDate: Date,
    endDate: Date,
    size: string | undefined,
    quantity: number | undefined,
    excludeBookingId?: number,
  ) {
    if (size === undefined) {
      const conflict = await tx.booking.findFirst({
        where: {
          dressId,
          status: { in: ACTIVE_BOOKING_STATUSES },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
          ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        },
      });

      if (conflict) {
        throw new BadRequestException(
          'קיימת כבר תפיסה של השמלה בטווח התאריכים המבוקש',
        );
      }

      return;
    }

    const overlapping = await tx.booking.findMany({
      where: {
        dressId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        OR: [{ size }, { size: null }],
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { startDate: true, endDate: true, size: true },
    });

    for (
      let day = new Date(startDate);
      day.getTime() <= endDate.getTime();
      day = addUtcDay(day)
    ) {
      const time = day.getTime();
      const coveringDay = overlapping.filter(
        (booking) =>
          booking.startDate.getTime() <= time && booking.endDate.getTime() >= time,
      );
      const wholeDressBlocked = coveringDay.some((booking) => booking.size === null);
      const sizeUsage = coveringDay.filter((booking) => booking.size === size).length;

      if (wholeDressBlocked || sizeUsage + 1 > (quantity ?? 1)) {
        throw new BadRequestException(
          'קיימת כבר תפיסה של כל היחידות במידה שנבחרה בטווח התאריכים המבוקש',
        );
      }
    }
  }

  private isSerializationConflict(error: unknown): boolean {
    // A transaction that failed under Serializable isolation due to a
    // write/read conflict (Postgres SQLSTATE 40001, "could not serialize
    // access due to read/write dependencies among transactions") - this is
    // exactly what two concurrent requests racing for the same unit(s)
    // surface as, and is an EXPECTED, normal outcome of using Serializable
    // isolation (not a bug in the request itself) - hence the retry.
    //
    // Checked two ways because this Prisma version's @prisma/adapter-pg
    // driver adapter throws a raw DriverAdapterError with the Postgres
    // SQLSTATE nested under `cause.originalCode` for this failure mode -
    // NOT the PrismaClientKnownRequestError-with-code-P2034 shape Prisma's
    // docs describe for other conflict scenarios. Verified directly against
    // a real concurrent-request race (see the stage report) rather than
    // assumed from documentation, since relying on the wrong shape here
    // silently disables the retry entirely and lets a legitimate,
    // recoverable conflict surface as a raw 500.
    if (!error || typeof error !== 'object') {
      return false;
    }

    const err = error as {
      code?: string;
      name?: string;
      cause?: { originalCode?: string; kind?: string };
    };

    return (
      err.code === 'P2034' ||
      err.cause?.originalCode === '40001' ||
      err.cause?.kind === 'TransactionWriteConflict'
    );
  }

  // Runs `operation` inside a Postgres SERIALIZABLE transaction so a
  // capacity-check-then-insert sequence can never race with a concurrent
  // request for the same size/date range - Postgres itself detects the
  // conflict and fails one of the two transactions rather than letting both
  // succeed and oversell the last unit. On a serialization failure, retries
  // the whole operation exactly once (transient conflicts are expected to
  // be rare and short-lived); if the retry also fails, surfaces a clear,
  // distinct conflict error rather than a generic one.
  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isSerializationConflict(error) || attempt === 1) {
          if (this.isSerializationConflict(error)) {
            throw new ConflictException(
              'מישהו אחר תפס את המידה או התאריך המבוקש ממש עכשיו - נסי שוב',
            );
          }

          throw error;
        }
      }
    }

    // Unreachable - the loop above always returns or throws.
    throw new ConflictException('שגיאה לא צפויה בעת שמירת ההזמנה - נסי שוב');
  }

  private assertValidSizeAndPrice(data: { size?: string; price?: number }) {
    if (data.size !== undefined && !data.size.trim()) {
      throw new BadRequestException('מידה אינה יכולה להיות ריקה');
    }

    if (data.price !== undefined && (Number.isNaN(data.price) || data.price < 0)) {
      throw new BadRequestException('מחיר אינו תקין');
    }
  }

  private translateForeignKeyError(error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2003'
    ) {
      return new BadRequestException('renterId שסופק אינו תקין');
    }

    return error;
  }

  // Unlike every other booking-mutating method here, the caller is the
  // RENTER, not the dress's owner - loadBookableDress performs no ownership
  // check, and renterId is trusted as-is (the controller forces it from the
  // caller's own JWT, never from the request body).
  async createInterested(data: {
    dressId: number;
    startDate: string | Date;
    endDate: string | Date;
    size?: string;
    renterId: number;
  }) {
    const dress = await this.loadBookableDress(data.dressId);
    this.assertDressBookable(dress);

    if (dress.ownerId === data.renterId) {
      throw new BadRequestException('לא ניתן לסמן עניין בשמלה שלך');
    }

    const startDate = this.parseDate(data.startDate, 'תאריך התחלה');
    const endDate = this.parseDate(data.endDate, 'תאריך סיום');
    this.assertValidRange(startDate, endDate);
    this.assertSizeSelection(dress, data.size);

    const hasSizes = (dress.sizes ?? []).length > 0;
    // Snapshots the size's price at the moment of interest, exactly like
    // createRented already does for a direct RENTED booking - so a later
    // price edit to the dress (or even removal of the size) can never
    // retroactively change what this renter was quoted when they expressed
    // interest. markAsRented uses this snapshot as-is rather than
    // re-deriving it from the (possibly since-changed) DressSize row.
    const matchingSize = hasSizes
      ? dress.sizes.find((candidate) => candidate.size === data.size)
      : undefined;

    return this.runSerializable(async (tx) => {
      await this.assertCapacityAvailable(
        tx,
        data.dressId,
        startDate,
        endDate,
        hasSizes ? data.size : undefined,
        matchingSize?.quantity,
      );

      return tx.booking.create({
        data: {
          dressId: data.dressId,
          renterId: data.renterId,
          startDate,
          endDate,
          status: BookingStatus.INTERESTED,
          size: hasSizes ? data.size : undefined,
          price: hasSizes ? matchingSize?.price : undefined,
        },
      });
    });
  }

  // TODO(auth-3): once payments (Phase 5) land, this must stop being callable
  // directly by the owner. The only path that may turn a booking RENTED will
  // be the payment-confirmation webhook - not a manual owner action - so the
  // leakage loophole (owner marks RENTED for a deal made off-platform) is
  // actually closed. Left as-is for now so the existing owner flow keeps
  // working until the webhook exists to replace it.
  async createRented(data: {
    dressId: number;
    startDate: string | Date;
    endDate: string | Date;
    renterId?: number;
    size?: string;
    price?: number;
    ownerId: number;
  }) {
    const dress = await this.loadOwnedDress(data.dressId, data.ownerId);
    this.assertDressBookable(dress);

    const startDate = this.parseDate(data.startDate, 'תאריך התחלה');
    const endDate = this.parseDate(data.endDate, 'תאריך סיום');
    this.assertValidRange(startDate, endDate);
    this.assertValidSizeAndPrice(data);
    this.assertSizeSelection(dress, data.size);

    const hasSizes = (dress.sizes ?? []).length > 0;
    const matchingSize = hasSizes
      ? dress.sizes.find((candidate) => candidate.size === data.size)
      : undefined;

    try {
      return await this.runSerializable(async (tx) => {
        await this.assertCapacityAvailable(
          tx,
          data.dressId,
          startDate,
          endDate,
          hasSizes ? data.size : undefined,
          matchingSize?.quantity,
        );

        return tx.booking.create({
          data: {
            dressId: data.dressId,
            startDate,
            endDate,
            status: BookingStatus.RENTED,
            renterId: data.renterId,
            size: data.size,
            price: data.price,
          },
        });
      });
    } catch (error) {
      throw this.translateForeignKeyError(error);
    }
  }

  async findForDress(dressId: number, ownerId: number) {
    await this.loadOwnedDress(dressId, ownerId);

    return this.prisma.booking.findMany({
      where: { dressId },
      orderBy: { startDate: 'asc' },
    });
  }

  // Public availability read: no ownership check by design (a future
  // renter browsing the catalog needs to see which dates are taken, not
  // just the dress owner) - only confirms the dress exists, then returns
  // the date range + status + size for the statuses that actually occupy
  // the calendar. `size` is included because per-size, quantity-aware
  // availability (a dress with S/M/L, each possibly with several physical
  // units, only has as many units of a size blocked as are actually booked)
  // needs it to be computable client-side without a new endpoint - it is a
  // physical dress attribute, not who booked it. renterId/price are never
  // selected here - this is the one booking-read path a non-owner (or
  // anonymous visitor) can reach. The response shape is unchanged from
  // before quantity existed - one row per active booking; quantity itself
  // comes from DressSize (already fetched separately by every consumer),
  // so counting rows per day against that quantity is exactly what makes
  // this quantity-aware without touching this endpoint at all.
  async findAvailabilityForDress(dressId: number) {
    const dress = await this.prisma.dress.findUnique({
      where: { id: dressId },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    return this.prisma.booking.findMany({
      where: {
        dressId,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      select: {
        startDate: true,
        endDate: true,
        status: true,
        size: true,
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async findForOwner(ownerId: number) {
    return this.prisma.booking.findMany({
      where: { dress: { ownerId } },
      include: {
        dress: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  // The renter-side equivalent of findForOwner - "my interests/rentals",
  // not "bookings on dresses I own". Includes one photo per dress (the
  // live/public-visible one, same OR filter used for sizes/photos
  // elsewhere in this file) so a "my requests" list can show a thumbnail
  // without a second request per booking.
  async findForRenter(renterId: number) {
    return this.prisma.booking.findMany({
      where: { renterId },
      include: {
        dress: {
          select: {
            id: true,
            name: true,
            photos: {
              where: { OR: [{ pendingAction: null }, { pendingAction: 'REMOVE' }] },
              orderBy: { sortOrder: 'asc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  private async loadOwnedBooking(bookingId: number, ownerId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        dress: {
          include: {
            sizes: { where: { OR: [{ pendingAction: null }, { pendingAction: 'REMOVE' }] } },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('ההזמנה לא נמצאה');
    }

    if (booking.dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לנהל את ההזמנה הזו');
    }

    return booking;
  }

  // TODO(auth-3): same as createRented above - after Phase 5, this must stop
  // being callable directly from the owner UI. Once the payment webhook
  // exists, it becomes the only caller allowed to move a booking to RENTED.
  async markAsRented(
    bookingId: number,
    ownerId: number,
    data: {
      startDate?: string | Date;
      endDate?: string | Date;
      renterId?: number;
      size?: string;
      price?: number;
    },
  ) {
    const booking = await this.loadOwnedBooking(bookingId, ownerId);

    if (booking.status !== BookingStatus.INTERESTED) {
      throw new BadRequestException(
        'ניתן להפוך להשכרה רק הזמנה שנמצאת במצב "מתעניינת"',
      );
    }

    this.assertDressBookable(booking.dress);

    const dressSizes = booking.dress.sizes ?? [];
    const hasSizes = dressSizes.length > 0;

    let size = booking.size;
    let price = booking.price;

    if (hasSizes) {
      // The size was already fixed when this booking was created as
      // INTERESTED (see createInterested) - it can't change at
      // confirm-rental time.
      if (data.size !== undefined && data.size !== booking.size) {
        throw new BadRequestException(
          'לא ניתן לשנות את המידה בשלב אישור ההשכרה - המידה נקבעה כשההתעניינות נוצרה',
        );
      }

      if (booking.price !== null) {
        // The price was already snapshotted onto the booking when it was
        // created as INTERESTED (see createInterested) - it's used as-is,
        // deliberately NOT re-derived from the size's current DressSize row,
        // so a later price edit to the dress (or even removal of the size
        // entirely) can never retroactively change what an existing renter
        // was quoted.
        price = booking.price;
      } else {
        // Legacy INTERESTED booking created before price-snapshotting
        // existed - best-effort fallback to the size's current price.
        const matchingSize = dressSizes.find(
          (candidate) => candidate.size === booking.size,
        );

        if (!matchingSize) {
          throw new BadRequestException(
            'לא נמצאה עוד הגדרת מחיר עבור המידה שנקבעה להתעניינות זו',
          );
        }

        price = matchingSize.price;
      }
    } else {
      // No DressSize rows for this dress - original free-text behavior,
      // untouched.
      this.assertValidSizeAndPrice(data);

      if (data.size !== undefined) {
        size = data.size;
      }

      if (data.price !== undefined) {
        price = data.price;
      }
    }

    let startDate = booking.startDate;
    let endDate = booking.endDate;
    let datesChanged = false;

    if (data.startDate !== undefined) {
      startDate = this.parseDate(data.startDate, 'תאריך התחלה');
      datesChanged = true;
    }

    if (data.endDate !== undefined) {
      endDate = this.parseDate(data.endDate, 'תאריך סיום');
      datesChanged = true;
    }

    this.assertValidRange(startDate, endDate);

    const finalStartDate = startDate;
    const finalEndDate = endDate;
    const finalSize = size;
    const finalPrice = price;

    try {
      if (datesChanged) {
        // A capacity re-check is only meaningful when the dates actually
        // move (the booking already holds its current range, so simply
        // confirming it as RENTED with unchanged dates can't newly exceed
        // capacity) - scoped into the same Serializable transaction as the
        // update for the same "don't let two requests take the last unit"
        // reason as booking creation.
        const matchingSize = hasSizes
          ? dressSizes.find((candidate) => candidate.size === finalSize)
          : undefined;

        return await this.runSerializable(async (tx) => {
          await this.assertCapacityAvailable(
            tx,
            booking.dressId,
            finalStartDate,
            finalEndDate,
            hasSizes ? finalSize ?? undefined : undefined,
            matchingSize?.quantity,
            booking.id,
          );

          return tx.booking.update({
            where: { id: bookingId },
            data: {
              status: BookingStatus.RENTED,
              startDate: finalStartDate,
              endDate: finalEndDate,
              renterId: data.renterId,
              size: finalSize,
              price: finalPrice,
            },
          });
        });
      }

      return await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.RENTED,
          startDate: finalStartDate,
          endDate: finalEndDate,
          renterId: data.renterId,
          size: finalSize,
          price: finalPrice,
        },
      });
    } catch (error) {
      throw this.translateForeignKeyError(error);
    }
  }

  // RENTED represents a real, previously-confirmed rental - cancelling one
  // is a business event worth keeping a record of, so it's soft-cancelled
  // (status -> CANCELLED) rather than deleted. INTERESTED is just a loose,
  // unconfirmed hold with no transaction behind it, so removing one is a
  // hard delete - there's nothing meaningful to preserve. Either way, once
  // CANCELLED (or deleted), the booking no longer counts toward any size's
  // used quantity - assertCapacityAvailable only ever looks at
  // ACTIVE_BOOKING_STATUSES.
  async cancelOrRemove(bookingId: number, ownerId: number) {
    const booking = await this.loadOwnedBooking(bookingId, ownerId);

    if (booking.status === BookingStatus.RENTED) {
      return this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CANCELLED },
      });
    }

    return this.prisma.booking.delete({ where: { id: bookingId } });
  }

  // Releases abandoned INTERESTED holds back into the calendar - a renter
  // who expressed interest and then went quiet (never converted to RENTED,
  // never cancelled) would otherwise block that date/size forever, since
  // ACTIVE_BOOKING_STATUSES counts INTERESTED toward capacity indefinitely.
  // CANCELLED (not delete) so this reads the same as any other cancellation
  // in findForOwner/findForDress history - only the *reason* is automatic.
  // `now` is a parameter (not read internally) so this is testable without
  // faking system time; the scheduled task (BookingExpiryTask) always calls
  // it with no argument, defaulting to the real current time.
  async expireStaleInterestedBookings(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - INTERESTED_EXPIRY_DAYS);

    const result = await this.prisma.booking.updateMany({
      where: {
        status: BookingStatus.INTERESTED,
        createdAt: { lt: cutoff },
      },
      data: { status: BookingStatus.CANCELLED },
    });

    return result.count;
  }
}
