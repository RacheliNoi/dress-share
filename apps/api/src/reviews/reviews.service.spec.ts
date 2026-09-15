import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '../../generated/prisma/enums';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: {
    booking: { findUnique: jest.Mock };
    review: {
      create: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    dress: { update: jest.Mock };
  };

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  beforeEach(async () => {
    prisma = {
      booking: { findUnique: jest.fn() },
      review: {
        create: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 }, _count: 2 }),
        findMany: jest.fn(),
      },
      dress: { update: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ReviewsService);
  });

  describe('create', () => {
    it('rejects a non-integer or out-of-range rating before touching the database', async () => {
      await expect(service.create(1, 1, 0)).rejects.toThrow(BadRequestException);
      await expect(service.create(1, 1, 6)).rejects.toThrow(BadRequestException);
      await expect(service.create(1, 1, 3.5)).rejects.toThrow(BadRequestException);
      expect(prisma.booking.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.create(1, 999, 5)).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when the booking isn't the caller's own", async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        renterId: 999,
        dressId: 1,
        status: BookingStatus.RENTED,
        endDate: yesterday,
      });

      await expect(service.create(1, 1, 5)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when the booking is not RENTED', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        renterId: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
        endDate: yesterday,
      });

      await expect(service.create(1, 1, 5)).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when the rental period hasn't ended yet", async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        renterId: 1,
        dressId: 1,
        status: BookingStatus.RENTED,
        endDate: tomorrow,
      });

      await expect(service.create(1, 1, 5)).rejects.toThrow(BadRequestException);
    });

    it('creates the review and refreshes the dress rating on success', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        renterId: 1,
        dressId: 7,
        status: BookingStatus.RENTED,
        endDate: yesterday,
      });
      prisma.review.create.mockResolvedValue({
        id: 1,
        bookingId: 1,
        dressId: 7,
        renterId: 1,
        rating: 5,
        comment: 'מעולה',
      });

      const result = await service.create(1, 1, 5, '  מעולה  ');

      expect(result.rating).toBe(5);
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: { bookingId: 1, dressId: 7, renterId: 1, rating: 5, comment: 'מעולה' },
      });
      expect(prisma.review.aggregate).toHaveBeenCalledWith({
        where: { dressId: 7 },
        _avg: { rating: true },
        _count: true,
      });
      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { averageRating: 4.5, reviewCount: 2 },
      });
    });

    it('stores no comment (null, not an empty string) when none is given', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        renterId: 1,
        dressId: 7,
        status: BookingStatus.RENTED,
        endDate: yesterday,
      });
      prisma.review.create.mockResolvedValue({ id: 1 });

      await service.create(1, 1, 4);

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: { bookingId: 1, dressId: 7, renterId: 1, rating: 4, comment: null },
      });
    });

    it('turns a duplicate-review database error into a friendly message', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        renterId: 1,
        dressId: 7,
        status: BookingStatus.RENTED,
        endDate: yesterday,
      });
      prisma.review.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.create(1, 1, 5)).rejects.toThrow(BadRequestException);
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });
  });

  describe('listForDress', () => {
    it("returns the dress's reviews, newest first, with the reviewer's name", async () => {
      prisma.review.findMany.mockResolvedValue([{ id: 1, renter: { name: 'שרה' } }]);

      const result = await service.listForDress(7);

      expect(result).toEqual([{ id: 1, renter: { name: 'שרה' } }]);
      expect(prisma.review.findMany).toHaveBeenCalledWith({
        where: { dressId: 7 },
        orderBy: { createdAt: 'desc' },
        include: { renter: { select: { name: true } } },
      });
    });
  });
});
