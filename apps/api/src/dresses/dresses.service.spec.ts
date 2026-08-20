import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { unlink } from 'fs/promises';
import { DressesService } from './dresses.service';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus } from '../../generated/prisma/enums';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('DressesService', () => {
  let service: DressesService;
  let prisma: {
    dress: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    dressPhoto: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    dressSize: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
    booking: {
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      dress: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      dressPhoto: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      dressSize: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      booking: {
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DressesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DressesService>(DressesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findApproved', () => {
    it('queries only APPROVED dresses', async () => {
      prisma.dress.findMany.mockResolvedValue([
        { id: 1, status: DressStatus.APPROVED },
      ]);

      const result = await service.findApproved();

      expect(prisma.dress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: DressStatus.APPROVED },
        }),
      );
      expect(result).toEqual([{ id: 1, status: DressStatus.APPROVED }]);
    });

    it('never selects pendingDetails/pendingReviewSubmittedAt, and filters sizes/photos to live-or-pending-removal only', async () => {
      prisma.dress.findMany.mockResolvedValue([]);

      await service.findApproved();

      const call = prisma.dress.findMany.mock.calls[0][0];

      expect(call.select.pendingDetails).toBeUndefined();
      expect(call.select.pendingReviewSubmittedAt).toBeUndefined();
      expect(call.select.sizes).toEqual({
        where: { OR: [{ pendingAction: null }, { pendingAction: 'REMOVE' }] },
      });
      expect(call.select.photos).toEqual({
        where: { OR: [{ pendingAction: null }, { pendingAction: 'REMOVE' }] },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('submitForApproval', () => {
    it('moves the owner\'s own DRAFT dress to PENDING_APPROVAL', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.DRAFT,
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.PENDING_APPROVAL,
      });

      await service.submitForApproval(1, 7);

      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: DressStatus.PENDING_APPROVAL, rejectionReason: null },
      });
    });

    it('allows resubmitting a REJECTED dress, clearing the old reason', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.REJECTED,
        rejectionReason: 'לא מתאים',
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.PENDING_APPROVAL,
        rejectionReason: null,
      });

      const result = await service.submitForApproval(1, 7);

      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: DressStatus.PENDING_APPROVAL, rejectionReason: null },
      });
      expect(result.status).toBe(DressStatus.PENDING_APPROVAL);
    });

    it('rejects submitting another user\'s dress', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.DRAFT,
      });

      await expect(service.submitForApproval(1, 7)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('rejects submitting a dress that is not DRAFT', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.PENDING_APPROVAL,
      });

      await expect(service.submitForApproval(1, 7)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it("updates the owner's own dress and returns it with sizes and photos included", async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.REJECTED,
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        ownerId: 7,
        name: 'שם מעודכן',
        status: DressStatus.REJECTED,
        sizes: [{ id: 1, size: 'M', price: 100 }],
        photos: [{ id: 1, originalUrl: '/uploads/a.jpg' }],
      });

      const result = await service.update(1, 7, { name: 'שם מעודכן' });

      expect(prisma.dress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          include: {
            sizes: true,
            photos: { orderBy: { sortOrder: 'asc' } },
          },
        }),
      );
      expect(result.sizes).toEqual([{ id: 1, size: 'M', price: 100 }]);
      expect(result.photos).toEqual([{ id: 1, originalUrl: '/uploads/a.jpg' }]);
    });

    it("rejects editing another user's dress", async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.REJECTED,
      });

      await expect(
        service.update(1, 7, { name: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('allows editing an APPROVED dress with no submitted pending edit - writes to pendingDetails, not the live fields', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        name: 'שם חי',
        description: 'תיאור חי',
        category: 'ערב',
        color: 'אדום',
        pendingDetails: null,
        pendingReviewSubmittedAt: null,
      });
      prisma.dress.update.mockResolvedValue({ id: 1, status: DressStatus.APPROVED });

      await service.update(1, 7, { name: 'שם מוצע' });

      expect(prisma.dress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: {
            pendingDetails: {
              name: 'שם מוצע',
              description: 'תיאור חי',
              category: 'ערב',
              color: 'אדום',
            },
          },
        }),
      );
    });

    it('merges into an already-in-progress pendingDetails draft rather than overwriting it', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        name: 'שם חי',
        description: 'תיאור חי',
        category: 'ערב',
        color: 'אדום',
        pendingDetails: { name: 'שם מוצע קודם', description: 'תיאור חי', category: 'ערב', color: 'אדום' },
        pendingReviewSubmittedAt: null,
      });
      prisma.dress.update.mockResolvedValue({ id: 1, status: DressStatus.APPROVED });

      await service.update(1, 7, { color: 'כחול' });

      expect(prisma.dress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            pendingDetails: {
              name: 'שם מוצע קודם',
              description: 'תיאור חי',
              category: 'ערב',
              color: 'כחול',
            },
          },
        }),
      );
    });

    it('rejects editing an APPROVED dress whose edit was already submitted for review', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        pendingDetails: null,
        pendingReviewSubmittedAt: new Date('2026-08-18'),
      });

      await expect(
        service.update(1, 7, { name: 'x' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('rejects editing a dress that is PENDING_APPROVAL', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.PENDING_APPROVAL,
      });

      await expect(
        service.update(1, 7, { name: 'x' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing dress', async () => {
      prisma.dress.findUnique.mockResolvedValue(null);

      await expect(
        service.update(999, 7, { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });
  });

  describe('updateSize', () => {
    it("updates the price of the owner's own size", async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        dress: { id: 1, ownerId: 7, status: DressStatus.REJECTED },
      });
      prisma.dressSize.update.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 150,
      });

      const result = await service.updateSize(1, 3, 7, { price: 150 });

      expect(prisma.dressSize.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { size: undefined, price: 150 },
      });
      expect(result.price).toBe(150);
    });

    it('translates a duplicate size-label conflict into a BadRequestException', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        dress: { id: 1, ownerId: 7, status: DressStatus.REJECTED },
      });
      prisma.dressSize.update.mockRejectedValue(
        Object.assign(new Error('unique constraint'), { code: 'P2002' }),
      );

      await expect(
        service.updateSize(1, 3, 7, { size: 'L' }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects updating another user's size", async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        dress: { id: 1, ownerId: 999, status: DressStatus.REJECTED },
      });

      await expect(
        service.updateSize(1, 3, 7, { price: 150 }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.dressSize.update).not.toHaveBeenCalled();
    });

    it('editing a live size on an APPROVED dress flags it REMOVE and creates a new ADD row - never mutates the live row', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        pendingAction: null,
        dress: {
          id: 1,
          ownerId: 7,
          status: DressStatus.APPROVED,
          pendingReviewSubmittedAt: null,
        },
      });
      prisma.dressSize.update.mockResolvedValue({ id: 3, size: 'M', price: 100, pendingAction: 'REMOVE' });
      prisma.dressSize.create.mockResolvedValue({ id: 9, dressId: 1, size: 'M', price: 150, pendingAction: 'ADD' });

      const result = await service.updateSize(1, 3, 7, { price: 150 });

      expect(prisma.dressSize.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { pendingAction: 'REMOVE' },
      });
      expect(prisma.dressSize.create).toHaveBeenCalledWith({
        data: { dressId: 1, size: 'M', price: 150, pendingAction: 'ADD' },
      });
      expect(result.pendingAction).toBe('ADD');
      expect(result.price).toBe(150);
    });

    it('reports whether the size being replaced has active bookings (non-blocking warning)', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        pendingAction: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.booking.count.mockResolvedValue(2);
      prisma.dressSize.update.mockResolvedValue({ id: 3 });
      prisma.dressSize.create.mockResolvedValue({ id: 9, dressId: 1, size: 'M', price: 150 });

      const result = await service.updateSize(1, 3, 7, { price: 150 });

      expect(prisma.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ dressId: 1, size: 'M' }) }),
      );
      expect((result as { activeBookingsCount?: number }).activeBookingsCount).toBe(2);
    });

    it('editing a not-yet-approved ADD-flagged row updates it directly (no remove+add pair)', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 9,
        dressId: 1,
        size: 'M',
        price: 150,
        pendingAction: 'ADD',
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.dressSize.update.mockResolvedValue({ id: 9, size: 'M', price: 175, pendingAction: 'ADD' });

      await service.updateSize(1, 9, 7, { price: 175 });

      expect(prisma.dressSize.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { size: undefined, price: 175 },
      });
      expect(prisma.dressSize.create).not.toHaveBeenCalled();
    });

    it('rejects editing a size already flagged for removal', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        pendingAction: 'REMOVE',
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });

      await expect(service.updateSize(1, 3, 7, { price: 150 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dressSize.update).not.toHaveBeenCalled();
    });

    it('rejects updating a size on an APPROVED dress whose edit was already submitted for review', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        pendingAction: null,
        dress: {
          id: 1,
          ownerId: 7,
          status: DressStatus.APPROVED,
          pendingReviewSubmittedAt: new Date('2026-08-18'),
        },
      });

      await expect(
        service.updateSize(1, 3, 7, { price: 150 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dressSize.update).not.toHaveBeenCalled();
    });

    it('rejects updating a size on a dress that is PENDING_APPROVAL', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        dress: { id: 1, ownerId: 7, status: DressStatus.PENDING_APPROVAL },
      });

      await expect(
        service.updateSize(1, 3, 7, { price: 150 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dressSize.update).not.toHaveBeenCalled();
    });

    it('returns NotFoundException for a missing size', async () => {
      prisma.dressSize.findUnique.mockResolvedValue(null);

      await expect(
        service.updateSize(1, 999, 7, { price: 150 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.dressSize.update).not.toHaveBeenCalled();
    });

    it("returns NotFoundException when the size belongs to a different dress", async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 42,
        size: 'M',
        price: 100,
        dress: { id: 42, ownerId: 7, status: DressStatus.REJECTED },
      });

      await expect(
        service.updateSize(1, 3, 7, { price: 150 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.dressSize.update).not.toHaveBeenCalled();
    });
  });

  describe('removeSize', () => {
    it("allows the owner to delete their own dress's size", async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        dress: { id: 1, ownerId: 7, status: DressStatus.REJECTED },
      });
      prisma.dressSize.delete.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
      });

      const result = await service.removeSize(1, 3, 7);

      expect(prisma.dressSize.delete).toHaveBeenCalledWith({
        where: { id: 3 },
      });
      expect(result.id).toBe(3);
    });

    it("rejects deleting another user's size", async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        dress: { id: 1, ownerId: 999, status: DressStatus.REJECTED },
      });

      await expect(service.removeSize(1, 3, 7)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.dressSize.delete).not.toHaveBeenCalled();
    });

    it('removing a live size from an APPROVED dress soft-flags REMOVE instead of deleting it', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        pendingAction: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.dressSize.update.mockResolvedValue({ id: 3, size: 'M', price: 100, pendingAction: 'REMOVE' });

      const result = await service.removeSize(1, 3, 7);

      expect(prisma.dressSize.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { pendingAction: 'REMOVE' },
      });
      expect(prisma.dressSize.delete).not.toHaveBeenCalled();
      expect(result.pendingAction).toBe('REMOVE');
    });

    it('returns activeBookingsCount when removing a size that has active bookings (non-blocking)', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        pendingAction: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.booking.count.mockResolvedValue(3);
      prisma.dressSize.update.mockResolvedValue({ id: 3, pendingAction: 'REMOVE' });

      const result = await service.removeSize(1, 3, 7);

      expect((result as { activeBookingsCount?: number }).activeBookingsCount).toBe(3);
    });

    it('removing a not-yet-approved ADD-flagged size hard-deletes it (never went live)', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 9,
        dressId: 1,
        size: 'XL',
        price: 999,
        pendingAction: 'ADD',
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.dressSize.delete.mockResolvedValue({ id: 9 });

      await service.removeSize(1, 9, 7);

      expect(prisma.dressSize.delete).toHaveBeenCalledWith({ where: { id: 9 } });
      expect(prisma.dressSize.update).not.toHaveBeenCalled();
    });

    it('rejects removing a size that is already flagged for removal', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        pendingAction: 'REMOVE',
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });

      await expect(service.removeSize(1, 3, 7)).rejects.toThrow(BadRequestException);
    });

    it('rejects deleting a size from an APPROVED dress whose edit was already submitted for review', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        pendingAction: null,
        dress: {
          id: 1,
          ownerId: 7,
          status: DressStatus.APPROVED,
          pendingReviewSubmittedAt: new Date('2026-08-18'),
        },
      });

      await expect(service.removeSize(1, 3, 7)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dressSize.delete).not.toHaveBeenCalled();
      expect(prisma.dressSize.update).not.toHaveBeenCalled();
    });

    it('rejects deleting a size from a dress that is PENDING_APPROVAL', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        dress: { id: 1, ownerId: 7, status: DressStatus.PENDING_APPROVAL },
      });

      await expect(service.removeSize(1, 3, 7)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dressSize.delete).not.toHaveBeenCalled();
    });

    it('returns NotFoundException for a missing size', async () => {
      prisma.dressSize.findUnique.mockResolvedValue(null);

      await expect(service.removeSize(1, 999, 7)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.dressSize.delete).not.toHaveBeenCalled();
    });
  });

  describe('quantity (multi-unit sizes)', () => {
    it('addSize defaults quantity to 1 when not provided', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.DRAFT,
      });
      prisma.dressSize.create.mockResolvedValue({ id: 1, size: 'M', price: 100, quantity: 1 });

      await service.addSize({ dressId: 1, size: 'M', price: 100, ownerId: 7 });

      expect(prisma.dressSize.create).toHaveBeenCalledWith({
        data: { dressId: 1, size: 'M', price: 100, quantity: 1, pendingAction: undefined },
      });
    });

    it('addSize stores an explicit quantity', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.DRAFT,
      });
      prisma.dressSize.create.mockResolvedValue({ id: 1, size: 'M', price: 100, quantity: 3 });

      await service.addSize({ dressId: 1, size: 'M', price: 100, quantity: 3, ownerId: 7 });

      expect(prisma.dressSize.create).toHaveBeenCalledWith({
        data: { dressId: 1, size: 'M', price: 100, quantity: 3, pendingAction: undefined },
      });
    });

    it('rejects a quantity below 1', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.DRAFT,
      });

      await expect(
        service.addSize({ dressId: 1, size: 'M', price: 100, quantity: 0, ownerId: 7 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dressSize.create).not.toHaveBeenCalled();
    });

    it('rejects a non-integer quantity', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.DRAFT,
      });

      await expect(
        service.addSize({ dressId: 1, size: 'M', price: 100, quantity: 1.5, ownerId: 7 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dressSize.create).not.toHaveBeenCalled();
    });

    it('updateSize on an APPROVED dress carries the new quantity into the ADD-flagged replacement row', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        quantity: 1,
        pendingAction: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.dressSize.update.mockResolvedValue({ id: 3, pendingAction: 'REMOVE' });
      prisma.dressSize.create.mockResolvedValue({ id: 9, dressId: 1, size: 'M', price: 100, quantity: 3, pendingAction: 'ADD' });

      const result = await service.updateSize(1, 3, 7, { quantity: 3 });

      expect(prisma.dressSize.create).toHaveBeenCalledWith({
        data: { dressId: 1, size: 'M', price: 100, quantity: 3, pendingAction: 'ADD' },
      });
      expect(result.quantity).toBe(3);
    });

    it('updateSize allows reducing quantity below the current active-bookings count, and reports the count', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        quantity: 3,
        pendingAction: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.booking.count.mockResolvedValue(3);
      prisma.dressSize.update.mockResolvedValue({ id: 3 });
      prisma.dressSize.create.mockResolvedValue({ id: 9, dressId: 1, size: 'M', price: 100, quantity: 1 });

      const result = await service.updateSize(1, 3, 7, { quantity: 1 });

      expect(prisma.dressSize.create).toHaveBeenCalledWith({
        data: { dressId: 1, size: 'M', price: 100, quantity: 1, pendingAction: 'ADD' },
      });
      expect((result as { activeBookingsCount?: number }).activeBookingsCount).toBe(3);
    });

    it('rejects an invalid quantity on updateSize', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        quantity: 1,
        pendingAction: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.REJECTED, pendingReviewSubmittedAt: null },
      });

      await expect(service.updateSize(1, 3, 7, { quantity: -1 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dressSize.update).not.toHaveBeenCalled();
    });
  });

  describe('removePhoto', () => {
    it("allows the owner to delete their own dress's photo", async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.DRAFT },
      });
      prisma.dressPhoto.delete.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
      });

      const result = await service.removePhoto(1, 5, 7);

      expect(prisma.dressPhoto.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining('photo-5.jpg'),
      );
      expect(result.id).toBe(5);
    });

    it("deletes the processed file too when present", async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: '/uploads/photo-5-processed.jpg',
        dress: { id: 1, ownerId: 7, status: DressStatus.DRAFT },
      });
      prisma.dressPhoto.delete.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: '/uploads/photo-5-processed.jpg',
      });

      await service.removePhoto(1, 5, 7);

      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining('photo-5.jpg'),
      );
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining('photo-5-processed.jpg'),
      );
    });

    it('does not fail the request when the file is already missing on disk', async () => {
      (unlink as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('missing'), { code: 'ENOENT' }),
      );
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.DRAFT },
      });
      prisma.dressPhoto.delete.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
      });

      await expect(service.removePhoto(1, 5, 7)).resolves.toMatchObject({
        id: 5,
      });
    });

    it("rejects deleting another user's photo", async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
        dress: { id: 1, ownerId: 999, status: DressStatus.DRAFT },
      });

      await expect(service.removePhoto(1, 5, 7)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.dressPhoto.delete).not.toHaveBeenCalled();
      expect(unlink).not.toHaveBeenCalled();
    });

    it('returns NotFoundException for a missing photo', async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue(null);

      await expect(service.removePhoto(1, 999, 7)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.dressPhoto.delete).not.toHaveBeenCalled();
    });

    it("returns NotFoundException when the photo belongs to a different dress (can't guess by photo id)", async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 42,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
        dress: { id: 42, ownerId: 7, status: DressStatus.DRAFT },
      });

      await expect(service.removePhoto(1, 5, 7)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.dressPhoto.delete).not.toHaveBeenCalled();
    });

    it('removing a live photo from an APPROVED dress soft-flags REMOVE and keeps the file on disk', async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
        pendingAction: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.dressPhoto.update.mockResolvedValue({ id: 5, pendingAction: 'REMOVE' });

      const result = await service.removePhoto(1, 5, 7);

      expect(prisma.dressPhoto.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { pendingAction: 'REMOVE' },
      });
      expect(prisma.dressPhoto.delete).not.toHaveBeenCalled();
      expect(unlink).not.toHaveBeenCalled();
      expect(result.pendingAction).toBe('REMOVE');
    });

    it('removing a not-yet-approved ADD-flagged photo hard-deletes it and its file (never went live)', async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 9,
        dressId: 1,
        originalUrl: '/uploads/photo-9.jpg',
        processedUrl: null,
        pendingAction: 'ADD',
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.dressPhoto.delete.mockResolvedValue({
        id: 9,
        originalUrl: '/uploads/photo-9.jpg',
        processedUrl: null,
      });

      await service.removePhoto(1, 9, 7);

      expect(prisma.dressPhoto.delete).toHaveBeenCalledWith({ where: { id: 9 } });
      expect(unlink).toHaveBeenCalledWith(expect.stringContaining('photo-9.jpg'));
    });

    it('rejects removing a photo that is already flagged for removal', async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
        pendingAction: 'REMOVE',
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });

      await expect(service.removePhoto(1, 5, 7)).rejects.toThrow(BadRequestException);
    });

    it('rejects deleting a photo from an APPROVED dress whose edit was already submitted for review', async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
        pendingAction: null,
        dress: {
          id: 1,
          ownerId: 7,
          status: DressStatus.APPROVED,
          pendingReviewSubmittedAt: new Date('2026-08-18'),
        },
      });

      await expect(service.removePhoto(1, 5, 7)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dressPhoto.delete).not.toHaveBeenCalled();
      expect(prisma.dressPhoto.update).not.toHaveBeenCalled();
    });

    it('rejects deleting a photo from a dress that is PENDING_APPROVAL', async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.PENDING_APPROVAL },
      });

      await expect(service.removePhoto(1, 5, 7)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dressPhoto.delete).not.toHaveBeenCalled();
    });
  });

  describe('addSize', () => {
    it('rejects adding a size to a dress that is PENDING_APPROVAL', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.PENDING_APPROVAL,
      });

      await expect(
        service.addSize({ dressId: 1, size: 'M', price: 100, ownerId: 7 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dressSize.create).not.toHaveBeenCalled();
    });

    it('adding a size to an APPROVED dress with no submitted edit creates an ADD-flagged row (hidden from public until approved)', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: null,
      });
      prisma.dressSize.create.mockResolvedValue({ id: 9, dressId: 1, size: 'M', price: 100, pendingAction: 'ADD' });

      const result = await service.addSize({ dressId: 1, size: 'M', price: 100, ownerId: 7 });

      expect(prisma.dressSize.create).toHaveBeenCalledWith({
        data: { dressId: 1, size: 'M', price: 100, quantity: 1, pendingAction: 'ADD' },
      });
      expect(result.pendingAction).toBe('ADD');
    });

    it('rejects adding a size to an APPROVED dress whose edit was already submitted for review', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: new Date('2026-08-18'),
      });

      await expect(
        service.addSize({ dressId: 1, size: 'M', price: 100, ownerId: 7 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dressSize.create).not.toHaveBeenCalled();
    });
  });

  describe('addPhotos', () => {
    it('rejects adding photos to a dress that is PENDING_APPROVAL', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.PENDING_APPROVAL,
      });

      await expect(
        service.addPhotos(1, 7, []),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dressPhoto.createMany).not.toHaveBeenCalled();
    });

    it('adding photos to an APPROVED dress with no submitted edit flags them ADD (hidden from public until approved)', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: null,
      });
      prisma.dressPhoto.createMany.mockResolvedValue({ count: 1 });

      await service.addPhotos(1, 7, [
        { filename: 'a.jpg' } as Express.Multer.File,
      ]);

      expect(prisma.dressPhoto.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ dressId: 1, pendingAction: 'ADD' }),
        ],
      });
    });

    it('rejects adding photos to an APPROVED dress whose edit was already submitted for review', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: new Date('2026-08-18'),
      });

      await expect(
        service.addPhotos(1, 7, []),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dressPhoto.createMany).not.toHaveBeenCalled();
    });
  });

  describe('submitEditForApproval', () => {
    it('locks in the pending edit by setting pendingReviewSubmittedAt (status stays APPROVED)', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: null,
        pendingDetails: { name: 'שם מוצע' },
        sizes: [],
        photos: [],
      });
      prisma.dress.update.mockResolvedValue({ id: 1, status: DressStatus.APPROVED });

      await service.submitEditForApproval(1, 7);

      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { pendingReviewSubmittedAt: expect.any(Date) },
      });
    });

    it('rejects when there is nothing pending to submit', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: null,
        pendingDetails: null,
        sizes: [{ pendingAction: null }],
        photos: [{ pendingAction: null }],
      });

      await expect(service.submitEditForApproval(1, 7)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('rejects submitting an edit for a dress that is not APPROVED', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.DRAFT,
        pendingReviewSubmittedAt: null,
        sizes: [],
        photos: [],
      });

      await expect(service.submitEditForApproval(1, 7)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects submitting an edit that was already submitted', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: new Date('2026-08-18'),
        sizes: [],
        photos: [],
      });

      await expect(service.submitEditForApproval(1, 7)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects submitting another user's edit", async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: null,
        sizes: [],
        photos: [],
      });

      await expect(service.submitEditForApproval(1, 7)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('cancelPendingEdit', () => {
    it('discards ADD rows (and their files) and restores REMOVE-flagged rows to live', async () => {
      prisma.dress.findUnique
        .mockResolvedValueOnce({
          id: 1,
          ownerId: 7,
          status: DressStatus.APPROVED,
          pendingReviewSubmittedAt: null,
        })
        .mockResolvedValueOnce({ id: 1, sizes: [], photos: [] });
      prisma.dressPhoto.findMany.mockResolvedValue([
        { id: 9, originalUrl: '/uploads/pending.jpg', processedUrl: null },
      ]);

      await service.cancelPendingEdit(1, 7);

      expect(prisma.dressPhoto.deleteMany).toHaveBeenCalledWith({
        where: { dressId: 1, pendingAction: 'ADD' },
      });
      expect(prisma.dressSize.deleteMany).toHaveBeenCalledWith({
        where: { dressId: 1, pendingAction: 'ADD' },
      });
      expect(prisma.dressPhoto.updateMany).toHaveBeenCalledWith({
        where: { dressId: 1, pendingAction: 'REMOVE' },
        data: { pendingAction: null },
      });
      expect(prisma.dressSize.updateMany).toHaveBeenCalledWith({
        where: { dressId: 1, pendingAction: 'REMOVE' },
        data: { pendingAction: null },
      });
      expect(unlink).toHaveBeenCalledWith(expect.stringContaining('pending.jpg'));
    });

    it('rejects cancelling an edit that was already submitted for review', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: new Date('2026-08-18'),
      });

      await expect(service.cancelPendingEdit(1, 7)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancelPendingSizeChange', () => {
    it('discards a pending ADD size', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 9,
        dressId: 1,
        pendingAction: 'ADD',
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.dressSize.delete.mockResolvedValue({ id: 9 });

      await service.cancelPendingSizeChange(1, 9, 7);

      expect(prisma.dressSize.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    });

    it('restores a REMOVE-flagged size back to live', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        pendingAction: 'REMOVE',
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });
      prisma.dressSize.update.mockResolvedValue({ id: 3, pendingAction: null });

      await service.cancelPendingSizeChange(1, 3, 7);

      expect(prisma.dressSize.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { pendingAction: null },
      });
    });

    it('rejects when there is nothing pending to cancel', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        pendingAction: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED, pendingReviewSubmittedAt: null },
      });

      await expect(service.cancelPendingSizeChange(1, 3, 7)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
