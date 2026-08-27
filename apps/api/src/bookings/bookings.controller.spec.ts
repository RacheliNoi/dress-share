import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { BookingsModule } from './bookings.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus, BookingStatus } from '../../generated/prisma/enums';

describe('BookingsController', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: {
    dress: { findUnique: jest.Mock };
    booking: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const approvedDress = { id: 1, ownerId: 7, status: DressStatus.APPROVED };

  function tokenFor(userId: number) {
    return jwtService.sign({
      sub: userId,
      email: `user${userId}@test.com`,
      role: 'USER',
    });
  }

  beforeEach(async () => {
    prisma = {
      dress: { findUnique: jest.fn() },
      booking: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        // Called once per test by BookingExpiryTask.onModuleInit, which now
        // runs for real whenever this suite boots the full BookingsModule -
        // not exercised by any assertion here, just needs to resolve so
        // app.init() doesn't throw.
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
      },
      $transaction: jest.fn((operation: (tx: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, BookingsModule, AuthModule],
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

  describe('POST /bookings/interested', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .post('/bookings/interested')
        .send({ dressId: 1, startDate: '2026-09-01', endDate: '2026-09-05' })
        .expect(401);
    });

    it('rejects a user who does not own the dress (403)', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.APPROVED,
      });

      await request(app.getHttpServer())
        .post('/bookings/interested')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .send({ dressId: 1, startDate: '2026-09-01', endDate: '2026-09-05' })
        .expect(403);

      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('allows the owner to create an INTERESTED booking', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
      });

      const response = await request(app.getHttpServer())
        .post('/bookings/interested')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .send({ dressId: 1, startDate: '2026-09-01', endDate: '2026-09-05' })
        .expect(201);

      expect(response.body.status).toBe(BookingStatus.INTERESTED);
    });

    it('rejects an invalid date range (400)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);

      await request(app.getHttpServer())
        .post('/bookings/interested')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .send({ dressId: 1, startDate: '2026-09-10', endDate: '2026-09-01' })
        .expect(400);

      expect(prisma.booking.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /bookings/rented', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .post('/bookings/rented')
        .send({ dressId: 1, startDate: '2026-10-01', endDate: '2026-10-05' })
        .expect(401);
    });

    it('allows the owner to create a RENTED booking', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({
        id: 2,
        status: BookingStatus.RENTED,
        renterId: 3,
      });

      const response = await request(app.getHttpServer())
        .post('/bookings/rented')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .send({
          dressId: 1,
          startDate: '2026-10-01',
          endDate: '2026-10-05',
          renterId: 3,
          size: 'M',
          price: 200,
        })
        .expect(201);

      expect(response.body.status).toBe(BookingStatus.RENTED);
    });
  });

  describe('GET /bookings/mine', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer()).get('/bookings/mine').expect(401);
    });

    it("returns the current user's bookings across all their dresses", async () => {
      prisma.booking.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const response = await request(app.getHttpServer())
        .get('/bookings/mine')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { dress: { ownerId: 7 } } }),
      );
    });
  });

  describe('GET /bookings/dress/:dressId', () => {
    it('rejects a non-owner (403)', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.APPROVED,
      });

      await request(app.getHttpServer())
        .get('/bookings/dress/1')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(403);
    });

    it('returns bookings for the owner', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([{ id: 1 }]);

      const response = await request(app.getHttpServer())
        .get('/bookings/dress/1')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
    });
  });

  describe('GET /bookings/dress/:dressId/availability', () => {
    it('works without a JWT (public endpoint)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/bookings/dress/1/availability')
        .expect(200);
    });

    it('returns [] for a dress with no active bookings', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get('/bookings/dress/1/availability')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('does not require the caller to own the dress', async () => {
      // Dress owned by 999, request made with a token for user 7 (or no
      // token at all) - must still succeed since this is public.
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.APPROVED,
      });
      prisma.booking.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/bookings/dress/1/availability')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);
    });

    it('returns only startDate/endDate/status - no renterId or other private fields', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([
        {
          startDate: new Date('2026-09-01').toISOString(),
          endDate: new Date('2026-09-05').toISOString(),
          status: BookingStatus.INTERESTED,
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/bookings/dress/1/availability')
        .expect(200);

      expect(Object.keys(response.body[0]).sort()).toEqual([
        'endDate',
        'startDate',
        'status',
      ]);
    });

    it('returns 404 for a dress that does not exist', async () => {
      prisma.dress.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/bookings/dress/999/availability')
        .expect(404);
    });
  });

  describe('PATCH /bookings/:id/rent', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .patch('/bookings/1/rent')
        .send({})
        .expect(401);
    });

    it("rejects updating another user's booking (403)", async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        dress: { id: 1, ownerId: 999, status: DressStatus.APPROVED },
      });

      await request(app.getHttpServer())
        .patch('/bookings/1/rent')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .send({})
        .expect(403);
    });

    it('transitions INTERESTED to RENTED for the owner', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        dress: approvedDress,
      });
      prisma.booking.update.mockResolvedValue({
        id: 1,
        status: BookingStatus.RENTED,
      });

      const response = await request(app.getHttpServer())
        .patch('/bookings/1/rent')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .send({ renterId: 3, size: 'M', price: 200 })
        .expect(200);

      expect(response.body.status).toBe(BookingStatus.RENTED);
    });

    it('rejects transitioning an already-RENTED booking (400)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.RENTED,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        dress: approvedDress,
      });

      await request(app.getHttpServer())
        .patch('/bookings/1/rent')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .send({})
        .expect(400);
    });
  });

  describe('DELETE /bookings/:id', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer()).delete('/bookings/1').expect(401);
    });

    it("rejects deleting another user's booking (403)", async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
        dress: { id: 1, ownerId: 999, status: DressStatus.APPROVED },
      });

      await request(app.getHttpServer())
        .delete('/bookings/1')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(403);

      expect(prisma.booking.delete).not.toHaveBeenCalled();
    });

    it('soft-cancels a RENTED booking for the owner', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.RENTED,
        dress: approvedDress,
      });
      prisma.booking.update.mockResolvedValue({
        id: 1,
        status: BookingStatus.CANCELLED,
      });

      const response = await request(app.getHttpServer())
        .delete('/bookings/1')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);

      expect(response.body.status).toBe(BookingStatus.CANCELLED);
      expect(prisma.booking.delete).not.toHaveBeenCalled();
    });

    it('hard-deletes an INTERESTED booking for the owner', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
        dress: approvedDress,
      });
      prisma.booking.delete.mockResolvedValue({ id: 1 });

      await request(app.getHttpServer())
        .delete('/bookings/1')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);

      expect(prisma.booking.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });
});
