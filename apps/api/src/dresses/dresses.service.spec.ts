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
  });
});
