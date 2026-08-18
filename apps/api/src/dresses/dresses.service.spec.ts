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
      delete: jest.Mock;
      createMany: jest.Mock;
    };
    dressSize: {
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      create: jest.Mock;
    };
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
        delete: jest.fn(),
        createMany: jest.fn(),
      },
      dressSize: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        create: jest.fn(),
      },
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

    it('rejects editing an already-APPROVED dress', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
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

    it('rejects updating a size on an already-APPROVED dress', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED },
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

    it('rejects deleting a size from an already-APPROVED dress', async () => {
      prisma.dressSize.findUnique.mockResolvedValue({
        id: 3,
        dressId: 1,
        size: 'M',
        price: 100,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED },
      });

      await expect(service.removeSize(1, 3, 7)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dressSize.delete).not.toHaveBeenCalled();
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

    it('rejects deleting a photo from an already-APPROVED dress', async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue({
        id: 5,
        dressId: 1,
        originalUrl: '/uploads/photo-5.jpg',
        processedUrl: null,
        dress: { id: 1, ownerId: 7, status: DressStatus.APPROVED },
      });

      await expect(service.removePhoto(1, 5, 7)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dressPhoto.delete).not.toHaveBeenCalled();
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

    it('rejects adding a size to an already-APPROVED dress', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
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

    it('rejects adding photos to an already-APPROVED dress', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.APPROVED,
      });

      await expect(
        service.addPhotos(1, 7, []),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dressPhoto.createMany).not.toHaveBeenCalled();
    });
  });
});
