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
    bookingMessage: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    dressAvailabilityBlock: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const approvedDress = {
    id: 1,
    ownerId: 7,
    status: DressStatus.APPROVED,
    name: 'שמלת בדיקה',
    owner: { email: 'owner7@test.com' },
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
      bookingMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      dressAvailabilityBlock: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
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

    it('allows a user who does NOT own the dress to create an INTERESTED booking, with renterId set from their own JWT', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress); // ownerId: 7
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({
        id: 1,
        dressId: 1,
        renterId: 3,
        status: BookingStatus.INTERESTED,
      });

      const response = await request(app.getHttpServer())
        .post('/bookings/interested')
        .set('Authorization', `Bearer ${tokenFor(3)}`) // user 3, not the owner (7)
        .send({ dressId: 1, startDate: '2026-09-01', endDate: '2026-09-05' })
        .expect(201);

      expect(response.body.status).toBe(BookingStatus.INTERESTED);
      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ renterId: 3 }),
      });
    });

    it('ignores a renterId in the request body - it always comes from the JWT', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({ id: 1, status: BookingStatus.INTERESTED });

      await request(app.getHttpServer())
        .post('/bookings/interested')
        .set('Authorization', `Bearer ${tokenFor(3)}`)
        .send({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          renterId: 999, // attempted spoof - must be ignored
        })
        .expect(201);

      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ renterId: 3 }),
      });
    });

    it('rejects the dress owner creating INTERESTED on their own dress (400)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress); // ownerId: 7

      await request(app.getHttpServer())
        .post('/bookings/interested')
        .set('Authorization', `Bearer ${tokenFor(7)}`) // the owner themselves
        .send({ dressId: 1, startDate: '2026-09-01', endDate: '2026-09-05' })
        .expect(400);

      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid date range (400)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);

      await request(app.getHttpServer())
        .post('/bookings/interested')
        .set('Authorization', `Bearer ${tokenFor(3)}`)
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

  describe('GET /bookings/as-renter', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer()).get('/bookings/as-renter').expect(401);
    });

    it('returns only the bookings this user created as a renter, scoped by their own JWT', async () => {
      prisma.booking.findMany.mockResolvedValue([{ id: 1, renterId: 3 }]);

      const response = await request(app.getHttpServer())
        .get('/bookings/as-renter')
        .set('Authorization', `Bearer ${tokenFor(3)}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { renterId: 3 } }),
      );
    });

    it("a different user's token scopes to their own id, not someone else's bookings", async () => {
      prisma.booking.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/bookings/as-renter')
        .set('Authorization', `Bearer ${tokenFor(42)}`)
        .expect(200);

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { renterId: 42 } }),
      );
    });
  });

  describe('GET/POST /bookings/:id/messages', () => {
    // renterId 3 on approvedDress (owner 7) - same convention as the rest
    // of this file.
    const booking = {
      id: 1,
      renterId: 3,
      dress: { ownerId: 7, name: 'שמלת בדיקה', owner: { email: 'owner7@test.com' } },
      renter: { email: 'renter3@test.com' },
    };

    it('GET rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer()).get('/bookings/1/messages').expect(401);
    });

    it("GET returns the thread for the booking's renter", async () => {
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.bookingMessage.findMany.mockResolvedValue([
        { id: 1, bookingId: 1, senderId: 3, body: 'hi' },
      ]);

      const response = await request(app.getHttpServer())
        .get('/bookings/1/messages')
        .set('Authorization', `Bearer ${tokenFor(3)}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
    });

    it("GET returns the thread for the dress's owner", async () => {
      prisma.booking.findUnique.mockResolvedValue(booking);

      await request(app.getHttpServer())
        .get('/bookings/1/messages')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);
    });

    it('GET rejects a user who is neither participant (403)', async () => {
      prisma.booking.findUnique.mockResolvedValue(booking);

      await request(app.getHttpServer())
        .get('/bookings/1/messages')
        .set('Authorization', `Bearer ${tokenFor(99)}`)
        .expect(403);
    });

    it('POST stores a message from the renter, with senderId forced from the JWT', async () => {
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.bookingMessage.create.mockResolvedValue({
        id: 2,
        bookingId: 1,
        senderId: 3,
        body: 'hello',
      });

      await request(app.getHttpServer())
        .post('/bookings/1/messages')
        .set('Authorization', `Bearer ${tokenFor(3)}`)
        .send({ body: 'hello' })
        .expect(201);

      expect(prisma.bookingMessage.create).toHaveBeenCalledWith({
        data: { bookingId: 1, senderId: 3, body: 'hello' },
      });
    });

    it('POST rejects a user who is neither participant (403)', async () => {
      prisma.booking.findUnique.mockResolvedValue(booking);

      await request(app.getHttpServer())
        .post('/bookings/1/messages')
        .set('Authorization', `Bearer ${tokenFor(99)}`)
        .send({ body: 'hi' })
        .expect(403);

      expect(prisma.bookingMessage.create).not.toHaveBeenCalled();
    });

    it('POST rejects an empty body (400)', async () => {
      prisma.booking.findUnique.mockResolvedValue(booking);

      await request(app.getHttpServer())
        .post('/bookings/1/messages')
        .set('Authorization', `Bearer ${tokenFor(3)}`)
        .send({ body: '   ' })
        .expect(400);
    });
  });

  describe('GET/POST /bookings/dress/:dressId/blocks and DELETE /bookings/blocks/:id', () => {
    it('GET rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer()).get('/bookings/dress/1/blocks').expect(401);
    });

    it('GET rejects a non-owner (403)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);

      await request(app.getHttpServer())
        .get('/bookings/dress/1/blocks')
        .set('Authorization', `Bearer ${tokenFor(3)}`)
        .expect(403);
    });

    it('GET returns the blocks for the owner', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.dressAvailabilityBlock.findMany.mockResolvedValue([{ id: 1 }]);

      const response = await request(app.getHttpServer())
        .get('/bookings/dress/1/blocks')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
    });

    it('POST creates a block for the owner (201)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.dressAvailabilityBlock.create.mockResolvedValue({
        id: 1,
        dressId: 1,
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-02T00:00:00.000Z',
        reason: null,
      });

      await request(app.getHttpServer())
        .post('/bookings/dress/1/blocks')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .send({ startDate: '2026-09-01', endDate: '2026-09-02' })
        .expect(201);
    });

    it('POST rejects a non-owner (403)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);

      await request(app.getHttpServer())
        .post('/bookings/dress/1/blocks')
        .set('Authorization', `Bearer ${tokenFor(3)}`)
        .send({ startDate: '2026-09-01', endDate: '2026-09-02' })
        .expect(403);

      expect(prisma.dressAvailabilityBlock.create).not.toHaveBeenCalled();
    });

    it('DELETE removes the block for the owner (200)', async () => {
      prisma.dressAvailabilityBlock.findUnique.mockResolvedValue({
        id: 5,
        dress: { ownerId: 7 },
      });
      prisma.dressAvailabilityBlock.delete.mockResolvedValue({ id: 5 });

      await request(app.getHttpServer())
        .delete('/bookings/blocks/5')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);
    });

    it('DELETE rejects a non-owner (403)', async () => {
      prisma.dressAvailabilityBlock.findUnique.mockResolvedValue({
        id: 5,
        dress: { ownerId: 7 },
      });

      await request(app.getHttpServer())
        .delete('/bookings/blocks/5')
        .set('Authorization', `Bearer ${tokenFor(3)}`)
        .expect(403);

      expect(prisma.dressAvailabilityBlock.delete).not.toHaveBeenCalled();
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
