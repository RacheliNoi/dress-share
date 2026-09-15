import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '../../generated/prisma/enums';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002',
    );
  }

  // Recomputed via aggregate (not incremental math, which would drift with
  // floating-point rounding over many reviews) every time a review is
  // created - read directly by the catalog/detail queries so showing a
  // dress's rating never costs a join or a live aggregate on every page
  // view. See averageRating/reviewCount's comment on the Dress model.
  private async refreshDressRating(dressId: number) {
    const aggregate = await this.prisma.review.aggregate({
      where: { dressId },
      _avg: { rating: true },
      _count: true,
    });

    await this.prisma.dress.update({
      where: { id: dressId },
      data: {
        averageRating: aggregate._avg.rating ?? 0,
        reviewCount: aggregate._count,
      },
    });
  }

  async create(
    renterId: number,
    bookingId: number,
    rating: number,
    comment?: string,
  ) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('דירוג חייב להיות מספר שלם בין 1 ל-5');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('הבקשה לא נמצאה');
    }

    if (booking.renterId !== renterId) {
      throw new ForbiddenException('אין הרשאה לדרג בקשה זו');
    }

    if (booking.status !== BookingStatus.RENTED || booking.endDate >= new Date()) {
      throw new BadRequestException(
        'ניתן לדרג רק לאחר שתקופת ההשכרה הסתיימה',
      );
    }

    try {
      const review = await this.prisma.review.create({
        data: {
          bookingId,
          dressId: booking.dressId,
          renterId,
          rating,
          comment: comment?.trim() || null,
        },
      });

      await this.refreshDressRating(booking.dressId);

      return review;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('כבר דירגת את ההשכרה הזו');
      }

      throw error;
    }
  }

  async listForDress(dressId: number) {
    return this.prisma.review.findMany({
      where: { dressId },
      orderBy: { createdAt: 'desc' },
      include: { renter: { select: { name: true } } },
    });
  }
}
