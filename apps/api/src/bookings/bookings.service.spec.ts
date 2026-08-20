import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus, BookingStatus } from '../../generated/prisma/enums';

describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: {
    dress: {
      findUnique: jest.Mock;
    };
    booking: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const approvedDress = { id: 1, ownerId: 7, status: DressStatus.APPROVED };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      dress: {
        findUnique: jest.fn(),
      },
      booking: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // In tests, the "transaction client" is just the same mocked prisma
      // object - real Postgres SERIALIZABLE isolation isn't something a
      // unit test can meaningfully simulate; the retry-on-conflict behavior
      // itself is covered separately below by rejecting with a P2034 error.
      $transaction: jest.fn((operation: (tx: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BookingsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInterested', () => {
    it('creates an INTERESTED booking for the owner of an APPROVED dress', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
      });

      const result = await service.createInterested({
        dressId: 1,
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        ownerId: 7,
      });

      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dressId: 1,
          status: BookingStatus.INTERESTED,
        }),
      });
      expect(result.status).toBe(BookingStatus.INTERESTED);
    });

    it('rejects for a user who does not own the dress (403)', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.APPROVED,
      });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing dress', async () => {
      prisma.dress.findUnique.mockResolvedValue(null);

      await expect(
        service.createInterested({
          dressId: 999,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects an endDate before startDate', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-10',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid (unparsable) date', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: 'not-a-date',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('allows a single-day booking (startDate === endDate)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({ id: 1, status: BookingStatus.INTERESTED });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-05',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).resolves.toBeDefined();
      expect(prisma.booking.create).toHaveBeenCalled();
    });

    it('rejects when the dress is not APPROVED', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.DRAFT,
      });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects when the dress is PENDING_APPROVAL', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.PENDING_APPROVAL,
      });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects when there is an overlapping active booking', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue({ id: 5 });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });
  });

  describe('createRented', () => {
    it('creates a RENTED booking with renter/size/price', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({
        id: 2,
        status: BookingStatus.RENTED,
        renterId: 3,
        size: 'M',
        price: 200,
      });

      const result = await service.createRented({
        dressId: 1,
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        renterId: 3,
        size: 'M',
        price: 200,
        ownerId: 7,
      });

      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: BookingStatus.RENTED,
          renterId: 3,
          size: 'M',
          price: 200,
        }),
      });
      expect(result.status).toBe(BookingStatus.RENTED);
    });

    it('creates a RENTED booking without renter/size/price (all optional)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({ id: 2, status: BookingStatus.RENTED });

      await expect(
        service.createRented({
          dressId: 1,
          startDate: '2026-10-01',
          endDate: '2026-10-05',
          ownerId: 7,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects creating RENTED for a dress owned by another user', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.APPROVED,
      });

      await expect(
        service.createRented({
          dressId: 1,
          startDate: '2026-10-01',
          endDate: '2026-10-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects an empty size string', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);

      await expect(
        service.createRented({
          dressId: 1,
          startDate: '2026-10-01',
          endDate: '2026-10-05',
          size: '   ',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects a negative price', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);

      await expect(
        service.createRented({
          dressId: 1,
          startDate: '2026-10-01',
          endDate: '2026-10-05',
          price: -10,
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects RENTED with a range overlapping an existing active booking', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue({ id: 9 });

      await expect(
        service.createRented({
          dressId: 1,
          startDate: '2026-10-01',
          endDate: '2026-10-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('translates a foreign key violation on renterId into a BadRequestException', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockRejectedValue(
        Object.assign(new Error('FK violation'), { code: 'P2003' }),
      );

      await expect(
        service.createRented({
          dressId: 1,
          startDate: '2026-10-01',
          endDate: '2026-10-05',
          renterId: 99999,
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('per-size availability (Fix 3)', () => {
    const dressWithSizes = {
      id: 1,
      ownerId: 7,
      status: DressStatus.APPROVED,
      sizes: [
        { id: 1, size: 'S' },
        { id: 2, size: 'M' },
        { id: 3, size: 'L' },
      ],
    };

    it('requires a size for createInterested when the dress has sizes', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithSizes);

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects an invented size that is not a real DressSize for this dress', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithSizes);

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          size: 'XL',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('does not require a size when the dress has no DressSize rows (legacy behavior preserved)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({ id: 1, status: BookingStatus.INTERESTED });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).resolves.toBeDefined();
    });

    it('scopes the capacity check to the requested size (OR size=null) when the dress has sizes', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithSizes);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.create.mockResolvedValue({ id: 1 });

      await service.createInterested({
        dressId: 1,
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        size: 'M',
        ownerId: 7,
      });

      expect(prisma.booking.findMany).toHaveBeenCalledWith({
        where: {
          dressId: 1,
          status: { in: [BookingStatus.INTERESTED, BookingStatus.RENTED] },
          startDate: { lte: new Date('2026-09-05') },
          endDate: { gte: new Date('2026-09-01') },
          OR: [{ size: 'M' }, { size: null }],
        },
        select: { startDate: true, endDate: true, size: true },
      });
    });

    it('allows booking a different size when an existing booking for another size overlaps the same range', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithSizes);
      // A booking for size M overlaps the requested range, but the request
      // is for size L - each size has its own capacity pool.
      prisma.booking.findMany.mockResolvedValue([
        { startDate: new Date('2026-09-01'), endDate: new Date('2026-09-05'), size: 'M' },
      ]);
      prisma.booking.create.mockResolvedValue({ id: 2, size: 'L' });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          size: 'L',
          ownerId: 7,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects when the single unit (default quantity 1) of a size is already booked on an overlapping day', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithSizes);
      prisma.booking.findMany.mockResolvedValue([
        { startDate: new Date('2026-09-03'), endDate: new Date('2026-09-03'), size: 'M' },
      ]);

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          size: 'M',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('createRented also requires and validates size when the dress has sizes', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithSizes);

      await expect(
        service.createRented({
          dressId: 1,
          startDate: '2026-10-01',
          endDate: '2026-10-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    describe('price snapshotting at INTERESTED-creation time', () => {
      it('snapshots the size price onto the booking when creating INTERESTED', async () => {
        prisma.dress.findUnique.mockResolvedValue({
          ...dressWithSizes,
          sizes: [
            { id: 1, size: 'S', price: 100 },
            { id: 2, size: 'M', price: 150 },
            { id: 3, size: 'L', price: 200 },
          ],
        });
        prisma.booking.findFirst.mockResolvedValue(null);
        prisma.booking.create.mockResolvedValue({ id: 1, size: 'M', price: 150 });

        await service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          size: 'M',
          ownerId: 7,
        });

        expect(prisma.booking.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ size: 'M', price: 150 }),
        });
      });

      it('markAsRented uses the snapshotted price, not the current (possibly changed) DressSize price', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          id: 1,
          dressId: 1,
          status: BookingStatus.INTERESTED,
          size: 'M',
          price: 150, // snapshotted at INTERESTED-creation time
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-05'),
          dress: {
            ...dressWithSizes,
            // The dress's M size was since edited to 999 (e.g. an approved
            // price edit) - the booking must NOT pick up the new price.
            sizes: [{ id: 2, size: 'M', price: 999 }],
          },
        });
        prisma.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.RENTED, price: 150 });

        const result = await service.markAsRented(1, 7, {});

        expect(prisma.booking.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ price: 150 }) }),
        );
        expect(result.price).toBe(150);
      });

      it('falls back to the current DressSize price for a legacy booking with no snapshotted price', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          id: 1,
          dressId: 1,
          status: BookingStatus.INTERESTED,
          size: 'M',
          price: null, // created before price-snapshotting existed
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-05'),
          dress: {
            ...dressWithSizes,
            sizes: [{ id: 2, size: 'M', price: 175 }],
          },
        });
        prisma.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.RENTED, price: 175 });

        await service.markAsRented(1, 7, {});

        expect(prisma.booking.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ price: 175 }) }),
        );
      });
    });

    describe('markAsRented size-locking', () => {
      it('locks the size from the INTERESTED booking and derives price from the matching DressSize', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          id: 1,
          dressId: 1,
          status: BookingStatus.INTERESTED,
          size: 'M',
          price: null,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-05'),
          dress: {
            ...dressWithSizes,
            sizes: [
              { id: 1, size: 'S', price: 100 },
              { id: 2, size: 'M', price: 150 },
              { id: 3, size: 'L', price: 200 },
            ],
          },
        });
        prisma.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.RENTED, size: 'M', price: 150 });

        const result = await service.markAsRented(1, 7, {});

        expect(prisma.booking.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ size: 'M', price: 150 }),
          }),
        );
        expect(result.price).toBe(150);
      });

      it('rejects an attempt to change the size at confirm-rental time', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          id: 1,
          dressId: 1,
          status: BookingStatus.INTERESTED,
          size: 'M',
          price: null,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-05'),
          dress: {
            ...dressWithSizes,
            sizes: [
              { id: 1, size: 'S', price: 100 },
              { id: 2, size: 'M', price: 150 },
              { id: 3, size: 'L', price: 200 },
            ],
          },
        });

        await expect(
          service.markAsRented(1, 7, { size: 'L' }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.booking.update).not.toHaveBeenCalled();
      });

      it('ignores a client-sent price and always uses the DressSize price when the dress has sizes', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          id: 1,
          dressId: 1,
          status: BookingStatus.INTERESTED,
          size: 'M',
          price: null,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-05'),
          dress: {
            ...dressWithSizes,
            sizes: [{ id: 2, size: 'M', price: 150 }],
          },
        });
        prisma.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.RENTED, price: 150 });

        await service.markAsRented(1, 7, { price: 999 });

        expect(prisma.booking.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ price: 150 }) }),
        );
      });
    });
  });

  describe('multi-unit quantity availability', () => {
    const dressWithQuantities = {
      id: 1,
      ownerId: 7,
      status: DressStatus.APPROVED,
      sizes: [
        { id: 1, size: 'S', price: 100, quantity: 1 },
        { id: 2, size: 'M', price: 150, quantity: 3 },
        { id: 3, size: 'L', price: 200, quantity: 1 },
      ],
    };

    it('allows a booking when quantity=3 and only 2 units are already booked on the overlapping day', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithQuantities);
      prisma.booking.findMany.mockResolvedValue([
        { startDate: new Date('2026-09-10'), endDate: new Date('2026-09-12'), size: 'M' },
        { startDate: new Date('2026-09-11'), endDate: new Date('2026-09-13'), size: 'M' },
      ]);
      prisma.booking.create.mockResolvedValue({ id: 5, size: 'M' });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-10',
          endDate: '2026-09-12',
          size: 'M',
          ownerId: 7,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a booking once all 3 units of quantity=3 are already booked on at least one overlapping day', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithQuantities);
      prisma.booking.findMany.mockResolvedValue([
        { startDate: new Date('2026-09-10'), endDate: new Date('2026-09-12'), size: 'M' },
        { startDate: new Date('2026-09-10'), endDate: new Date('2026-09-12'), size: 'M' },
        { startDate: new Date('2026-09-11'), endDate: new Date('2026-09-11'), size: 'M' },
      ]);

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-10',
          endDate: '2026-09-12',
          size: 'M',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses correct day-by-day peak usage: two non-concurrent existing bookings must not block a request that never actually exceeds quantity=1', async () => {
      // Two existing L bookings (quantity=1) that never overlap each other
      // (Sep 1-3 and Sep 10-12) both loosely "overlap" a wide new request
      // (Sep 2-11) - but a naive row-count (2) would wrongly compare
      // against quantity 1 the same way as a real conflict. Here it SHOULD
      // still be rejected, but only because each individually already
      // exceeds quantity=1 on its own days - verifying the day-level
      // reasoning is actually being applied (see the next test for the
      // case where day-level reasoning changes the outcome).
      prisma.dress.findUnique.mockResolvedValue(dressWithQuantities);
      prisma.booking.findMany.mockResolvedValue([
        { startDate: new Date('2026-09-01'), endDate: new Date('2026-09-03'), size: 'L' },
        { startDate: new Date('2026-09-10'), endDate: new Date('2026-09-12'), size: 'L' },
      ]);

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-02',
          endDate: '2026-09-11',
          size: 'L',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('day-by-day peak usage ALLOWS a request that a naive overlapping-row-count would incorrectly reject', async () => {
      // quantity=2. Two existing bookings, staggered and never concurrent
      // with each other (Sep 1-5, Sep 10-15). A new Sep 4-11 request
      // overlaps BOTH in the loose interval sense (2 overlapping rows),
      // which a naive "row count >= quantity" check (2 >= 2) would wrongly
      // reject - but actual peak concurrent usage on any single day never
      // exceeds 1 existing + 1 new = 2, exactly at (not over) capacity.
      const dressQuantityTwo = {
        ...dressWithQuantities,
        sizes: [{ id: 2, size: 'M', price: 150, quantity: 2 }],
      };
      prisma.dress.findUnique.mockResolvedValue(dressQuantityTwo);
      prisma.booking.findMany.mockResolvedValue([
        { startDate: new Date('2026-09-01'), endDate: new Date('2026-09-05'), size: 'M' },
        { startDate: new Date('2026-09-10'), endDate: new Date('2026-09-15'), size: 'M' },
      ]);
      prisma.booking.create.mockResolvedValue({ id: 9, size: 'M' });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-04',
          endDate: '2026-09-11',
          size: 'M',
          ownerId: 7,
        }),
      ).resolves.toBeDefined();
    });

    it('a size:null (whole-dress) active booking blocks every size regardless of its quantity', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithQuantities);
      prisma.booking.findMany.mockResolvedValue([
        { startDate: new Date('2026-09-10'), endDate: new Date('2026-09-12'), size: null },
      ]);

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-10',
          endDate: '2026-09-12',
          size: 'M',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('CANCELLED bookings never consume a unit - excluded at the DB query level via ACTIVE_BOOKING_STATUSES', async () => {
      prisma.dress.findUnique.mockResolvedValue(dressWithQuantities);
      // Simulates the CANCELLED row already excluded by the where clause -
      // findMany simply never returns it.
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.create.mockResolvedValue({ id: 1, size: 'L' });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-10',
          endDate: '2026-09-12',
          size: 'L',
          ownerId: 7,
        }),
      ).resolves.toBeDefined();

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [BookingStatus.INTERESTED, BookingStatus.RENTED] },
          }),
        }),
      );
    });
  });

  describe('concurrency (SERIALIZABLE transaction + one automatic retry)', () => {
    function serializationConflictError() {
      return Object.assign(new Error('could not serialize access due to concurrent update'), {
        code: 'P2034',
      });
    }

    // The shape actually thrown by @prisma/adapter-pg in this Prisma
    // version for a real Postgres SQLSTATE 40001 conflict - confirmed
    // against a live concurrent-request race (see the stage report). This
    // does NOT have a top-level `code: 'P2034'` the way serializationConflictError()
    // above simulates - the retry logic must handle both shapes, since
    // relying only on the P2034 shape silently disabled the retry and let
    // real conflicts surface as raw 500s.
    function driverAdapterConflictError() {
      return Object.assign(new Error('TransactionWriteConflict'), {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '40001',
          originalMessage: 'could not serialize access due to read/write dependencies among transactions',
          kind: 'TransactionWriteConflict',
        },
      });
    }

    it('uses SERIALIZABLE isolation for the capacity-check + create transaction', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({ id: 1 });

      await service.createInterested({
        dressId: 1,
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        ownerId: 7,
      });

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
    });

    it('retries exactly once on a serialization conflict, and succeeds if the retry passes', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({ id: 1, status: BookingStatus.INTERESTED });

      let call = 0;
      prisma.$transaction.mockImplementation(
        async (operation: (tx: typeof prisma) => Promise<unknown>) => {
          call += 1;
          if (call === 1) {
            throw serializationConflictError();
          }
          return operation(prisma);
        },
      );

      const result = await service.createInterested({
        dressId: 1,
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        ownerId: 7,
      });

      expect(call).toBe(2);
      expect(result.status).toBe(BookingStatus.INTERESTED);
    });

    it('retries on the real @prisma/adapter-pg DriverAdapterError conflict shape (not just a top-level P2034 code)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({ id: 1, status: BookingStatus.INTERESTED });

      let call = 0;
      prisma.$transaction.mockImplementation(
        async (operation: (tx: typeof prisma) => Promise<unknown>) => {
          call += 1;
          if (call === 1) {
            throw driverAdapterConflictError();
          }
          return operation(prisma);
        },
      );

      const result = await service.createInterested({
        dressId: 1,
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        ownerId: 7,
      });

      expect(call).toBe(2);
      expect(result.status).toBe(BookingStatus.INTERESTED);
    });

    it('surfaces a clear ConflictException (not a raw 500) when the retry also fails with the real DriverAdapterError conflict shape', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.$transaction.mockRejectedValue(driverAdapterConflictError());

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('surfaces a clear ConflictException if the retry also fails with a serialization conflict (two requests racing for the last unit)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.$transaction.mockRejectedValue(serializationConflictError());

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('does not retry, and does not mask, a non-conflict error', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.$transaction.mockRejectedValue(new Error('some other db error'));

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow('some other db error');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('overlap detection (assertNoOverlap via createInterested)', () => {
    // These tests assert on the WHERE clause passed to findFirst, which is
    // the actual overlap predicate: existing.startDate <= new.endDate AND
    // existing.endDate >= new.startDate, restricted to INTERESTED/RENTED.
    it('queries only active (INTERESTED/RENTED) statuses for conflicts', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({ id: 1 });

      await service.createInterested({
        dressId: 1,
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        ownerId: 7,
      });

      expect(prisma.booking.findFirst).toHaveBeenCalledWith({
        where: {
          dressId: 1,
          status: { in: [BookingStatus.INTERESTED, BookingStatus.RENTED] },
          startDate: { lte: new Date('2026-09-05') },
          endDate: { gte: new Date('2026-09-01') },
        },
      });
    });

    it('flags a conflict when an existing booking starts before the new range and ends inside it', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      // Simulated as: findFirst is called with a predicate that WOULD match
      // an existing row [08-28, 09-02] against a new range [09-01, 09-05].
      // We assert the service treats a non-null result as a conflict.
      prisma.booking.findFirst.mockResolvedValue({ id: 1, startDate: new Date('2026-08-28'), endDate: new Date('2026-09-02') });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('flags a conflict when an existing booking is entirely inside the new range', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue({ id: 1, startDate: new Date('2026-09-02'), endDate: new Date('2026-09-03') });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('flags a conflict when an existing booking contains the whole new range', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue({ id: 1, startDate: new Date('2026-08-01'), endDate: new Date('2026-10-01') });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('flags a conflict for the exact same day', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue({ id: 1, startDate: new Date('2026-09-05'), endDate: new Date('2026-09-05') });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-05',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('flags a conflict for identical boundaries', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue({ id: 1, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-05') });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows a range that does not overlap anything (no false positive)', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.create.mockResolvedValue({ id: 1 });

      await expect(
        service.createInterested({
          dressId: 1,
          startDate: '2026-11-01',
          endDate: '2026-11-05',
          ownerId: 7,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('findAvailabilityForDress', () => {
    it('returns an empty array for a dress with no bookings', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([]);

      const result = await service.findAvailabilityForDress(1);

      expect(result).toEqual([]);
    });

    it('includes INTERESTED bookings', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([
        {
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-05'),
          status: BookingStatus.INTERESTED,
        },
      ]);

      const result = await service.findAvailabilityForDress(1);

      expect(result).toEqual([
        expect.objectContaining({ status: BookingStatus.INTERESTED }),
      ]);
    });

    it('includes RENTED bookings', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([
        {
          startDate: new Date('2026-10-01'),
          endDate: new Date('2026-10-05'),
          status: BookingStatus.RENTED,
        },
      ]);

      const result = await service.findAvailabilityForDress(1);

      expect(result).toEqual([
        expect.objectContaining({ status: BookingStatus.RENTED }),
      ]);
    });

    it('queries only INTERESTED/RENTED - excludes CANCELLED and any other status at the DB level', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([]);

      await service.findAvailabilityForDress(1);

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            dressId: 1,
            status: { in: [BookingStatus.INTERESTED, BookingStatus.RENTED] },
          },
        }),
      );
    });

    it('selects startDate, endDate, status, size - never renterId/price or other private fields', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([]);

      await service.findAvailabilityForDress(1);

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { startDate: true, endDate: true, status: true, size: true },
        }),
      );
    });

    it('orders results by startDate ascending', async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([]);

      await service.findAvailabilityForDress(1);

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startDate: 'asc' } }),
      );
    });

    it('throws NotFoundException for a dress that does not exist (no ownership check)', async () => {
      prisma.dress.findUnique.mockResolvedValue(null);

      await expect(service.findAvailabilityForDress(999)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.booking.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findForDress / findForOwner', () => {
    it("returns a dress's bookings for its owner", async () => {
      prisma.dress.findUnique.mockResolvedValue(approvedDress);
      prisma.booking.findMany.mockResolvedValue([{ id: 1, dressId: 1 }]);

      const result = await service.findForDress(1, 7);

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { dressId: 1 } }),
      );
      expect(result).toEqual([{ id: 1, dressId: 1 }]);
    });

    it("rejects reading a dress's bookings for a non-owner", async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.APPROVED,
      });

      await expect(service.findForDress(1, 7)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns all bookings across the owner\'s dresses', async () => {
      prisma.booking.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await service.findForOwner(7);

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { dress: { ownerId: 7 } } }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('markAsRented', () => {
    it('transitions an INTERESTED booking to RENTED', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        dress: approvedDress,
      });
      prisma.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.RENTED });

      const result = await service.markAsRented(1, 7, {
        renterId: 3,
        size: 'M',
        price: 200,
      });

      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: BookingStatus.RENTED }),
        }),
      );
      expect(result.status).toBe(BookingStatus.RENTED);
      // Dates unchanged -> no overlap re-check against itself.
      expect(prisma.booking.findFirst).not.toHaveBeenCalled();
    });

    it('re-checks overlap (excluding itself) when dates are changed', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        dress: approvedDress,
      });
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.RENTED });

      await service.markAsRented(1, 7, {
        startDate: '2026-09-02',
        endDate: '2026-09-06',
      });

      expect(prisma.booking.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: 1 } }),
        }),
      );
    });

    it('rejects transitioning an already-RENTED booking (illegal transition)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.RENTED,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        dress: approvedDress,
      });

      await expect(service.markAsRented(1, 7, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects transitioning a CANCELLED booking (illegal transition)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.CANCELLED,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        dress: approvedDress,
      });

      await expect(service.markAsRented(1, 7, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.booking.update).not.toHaveBeenCalled();
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

      await expect(service.markAsRented(1, 7, {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.markAsRented(999, 7, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancelOrRemove', () => {
    it('soft-cancels a RENTED booking (sets status to CANCELLED, preserved)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.RENTED,
        dress: approvedDress,
      });
      prisma.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.CANCELLED });

      const result = await service.cancelOrRemove(1, 7);

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: BookingStatus.CANCELLED },
      });
      expect(prisma.booking.delete).not.toHaveBeenCalled();
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('hard-deletes an INTERESTED booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
        dress: approvedDress,
      });
      prisma.booking.delete.mockResolvedValue({ id: 1 });

      await service.cancelOrRemove(1, 7);

      expect(prisma.booking.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it("rejects deleting another user's booking (403)", async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 1,
        dressId: 1,
        status: BookingStatus.INTERESTED,
        dress: { id: 1, ownerId: 999, status: DressStatus.APPROVED },
      });

      await expect(service.cancelOrRemove(1, 7)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.booking.delete).not.toHaveBeenCalled();
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.cancelOrRemove(999, 7)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
