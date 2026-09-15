import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { ReviewsModule } from './reviews.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '../../generated/prisma/enums';

describe('ReviewsController', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: {
    booking: { findUnique: jest.Mock };
    review: {
      create: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    dress: { update: jest.Mock };
  };

  function tokenFor(userId: number) {
    return jwtService.sign({
      sub: userId,
      email: `user${userId}@test.com`,
      role: 'USER',
    });
  }

  beforeEach(async () => {
    prisma = {
      booking: { findUnique: jest.fn() },
      review: {
        create: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 5 }, _count: 1 }),
        findMany: jest.fn(),
      },
      dress: { update: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, ReviewsModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  describe('POST /reviews', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .post('/reviews')
        .send({ bookingId: 1, rating: 5 })
        .expect(401);
    });

    it("creates a review for the caller's own completed booking", async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        renterId: 1,
        dressId: 7,
        status: BookingStatus.RENTED,
        endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      prisma.review.create.mockResolvedValue({
        id: 1,
        bookingId: 1,
        dressId: 7,
        renterId: 1,
        rating: 5,
        comment: null,
      });

      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({ bookingId: 1, rating: 5 })
        .expect(201);

      expect(prisma.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookingId: 1, renterId: 1, rating: 5 }),
        }),
      );
    });

    it("400s when trying to review someone else's booking", async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        renterId: 999,
        dressId: 7,
        status: BookingStatus.RENTED,
        endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({ bookingId: 1, rating: 5 })
        .expect(403);
    });
  });

  describe('GET /reviews', () => {
    it('is publicly accessible and lists a dress\'s reviews', async () => {
      prisma.review.findMany.mockResolvedValue([
        { id: 1, dressId: 7, rating: 5, renter: { name: 'שרה' } },
      ]);

      const response = await request(app.getHttpServer())
        .get('/reviews')
        .query({ dressId: '7' })
        .expect(200);

      expect(response.body).toEqual([
        { id: 1, dressId: 7, rating: 5, renter: { name: 'שרה' } },
      ]);
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { dressId: 7 } }),
      );
    });
  });
});
