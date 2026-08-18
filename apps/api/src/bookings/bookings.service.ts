import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, DressStatus } from '../../generated/prisma/enums';

// Only these two statuses represent a dress actually being held for its
// date range. CANCELLED is intentionally excluded so a cancelled booking
// frees up its dates. The legacy PENDING/CONFIRMED/COMPLETED values predate
// this stage, have no code path that ever creates them, and are left out on
// purpose rather than guessing behavior for them - see the stage report.
const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.INTERESTED,
  BookingStatus.RENTED,
];

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
  // turnover) - the conservative, safe default for this stage.
  private async assertNoOverlap(
    dressId: number,
    startDate: Date,
    endDate: Date,
    excludeBookingId?: number,
  ) {
    const conflict = await this.prisma.booking.findFirst({
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

  async createInterested(data: {
    dressId: number;
    startDate: string | Date;
    endDate: string | Date;
    ownerId: number;
  }) {
    const dress = await this.loadOwnedDress(data.dressId, data.ownerId);
    this.assertDressBookable(dress);

    const startDate = this.parseDate(data.startDate, 'תאריך התחלה');
    const endDate = this.parseDate(data.endDate, 'תאריך סיום');
    this.assertValidRange(startDate, endDate);

    await this.assertNoOverlap(data.dressId, startDate, endDate);

    return this.prisma.booking.create({
      data: {
        dressId: data.dressId,
        startDate,
        endDate,
        status: BookingStatus.INTERESTED,
      },
    });
  }

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

    await this.assertNoOverlap(data.dressId, startDate, endDate);

    try {
      return await this.prisma.booking.create({
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
  // just the date range + status for the statuses that actually occupy the
  // calendar. renterId/size/price are never selected here - this is the one
  // booking-read path a non-owner (or anonymous visitor) can reach.
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

  private async loadOwnedBooking(bookingId: number, ownerId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { dress: true },
    });

    if (!booking) {
      throw new NotFoundException('ההזמנה לא נמצאה');
    }

    if (booking.dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לנהל את ההזמנה הזו');
    }

    return booking;
  }

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
    this.assertValidSizeAndPrice(data);

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

    // Dates didn't change, so this booking's own existing range can't be in
    // conflict with itself - nothing new to check.
    if (datesChanged) {
      await this.assertNoOverlap(
        booking.dressId,
        startDate,
        endDate,
        booking.id,
      );
    }

    try {
      return await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.RENTED,
          startDate,
          endDate,
          renterId: data.renterId,
          size: data.size,
          price: data.price,
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
  // hard delete - there's nothing meaningful to preserve.
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
}
