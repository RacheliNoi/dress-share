import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus } from '../../generated/prisma/enums';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    dress: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    dressPhoto: { deleteMany: jest.Mock; updateMany: jest.Mock };
    dressSize: { deleteMany: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: { adminInitiatePasswordReset: jest.Mock };

  beforeEach(async () => {
    prisma = {
      dress: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      dressPhoto: { deleteMany: jest.fn(), updateMany: jest.fn() },
      dressSize: { deleteMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    authService = {
      adminInitiatePasswordReset: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findPendingDresses', () => {
    it('queries both PENDING_APPROVAL dresses and APPROVED dresses with a submitted edit', async () => {
      prisma.dress.findMany.mockResolvedValue([]);

      await service.findPendingDresses();

      expect(prisma.dress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { status: DressStatus.PENDING_APPROVAL },
              { pendingReviewSubmittedAt: { not: null } },
            ],
          },
        }),
      );
    });
  });

  describe('approveDress', () => {
    it('approves a PENDING_APPROVAL dress', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.PENDING_APPROVAL,
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        status: DressStatus.APPROVED,
      });

      await service.approveDress(1);

      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: DressStatus.APPROVED, rejectionReason: null },
      });
    });

    it('rejects approving a dress that is not PENDING_APPROVAL', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.DRAFT,
      });

      await expect(service.approveDress(1)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('rejects approving an already-APPROVED dress', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.APPROVED,
      });

      await expect(service.approveDress(1)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the dress does not exist', async () => {
      prisma.dress.findUnique.mockResolvedValue(null);

      await expect(service.approveDress(999)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('applies a submitted edit: promotes ADD rows, deletes REMOVE rows, applies pendingDetails, keeps status APPROVED', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: new Date('2026-08-18'),
        pendingDetails: { name: 'שם חדש', color: 'כחול' },
        sizes: [{ id: 1, pendingAction: 'REMOVE' }, { id: 2, pendingAction: 'ADD' }],
        photos: [{ id: 5, pendingAction: 'REMOVE', originalUrl: '/uploads/old.jpg', processedUrl: null }],
      });
      prisma.dress.update.mockResolvedValue({ id: 1, status: DressStatus.APPROVED, name: 'שם חדש' });

      const result = await service.approveDress(1);

      expect(prisma.dressPhoto.deleteMany).toHaveBeenCalledWith({
        where: { dressId: 1, pendingAction: 'REMOVE' },
      });
      expect(prisma.dressSize.deleteMany).toHaveBeenCalledWith({
        where: { dressId: 1, pendingAction: 'REMOVE' },
      });
      expect(prisma.dressPhoto.updateMany).toHaveBeenCalledWith({
        where: { dressId: 1, pendingAction: 'ADD' },
        data: { pendingAction: null },
      });
      expect(prisma.dressSize.updateMany).toHaveBeenCalledWith({
        where: { dressId: 1, pendingAction: 'ADD' },
        data: { pendingAction: null },
      });
      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          name: 'שם חדש',
          color: 'כחול',
          pendingReviewSubmittedAt: null,
          rejectionReason: null,
        }),
      });
      expect(result.status).toBe(DressStatus.APPROVED);
    });
  });

  describe('rejectDress', () => {
    it('rejects a PENDING_APPROVAL dress and stores the reason', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.PENDING_APPROVAL,
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        status: DressStatus.REJECTED,
        rejectionReason: 'התמונות לא ברורות מספיק',
      });

      await service.rejectDress(1, 'התמונות לא ברורות מספיק');

      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: DressStatus.REJECTED,
          rejectionReason: 'התמונות לא ברורות מספיק',
        },
      });
    });

    it('trims the reason before storing it', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.PENDING_APPROVAL,
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        status: DressStatus.REJECTED,
      });

      await service.rejectDress(1, '  לא מתאים  ');

      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: DressStatus.REJECTED, rejectionReason: 'לא מתאים' },
      });
    });

    it('rejects without a reason', async () => {
      await expect(service.rejectDress(1, '')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dress.findUnique).not.toHaveBeenCalled();
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('rejects a reason that is only whitespace', async () => {
      await expect(service.rejectDress(1, '   ')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('rejects rejecting a dress that is not PENDING_APPROVAL', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.DRAFT,
      });

      await expect(service.rejectDress(1, 'סיבה')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('discards a submitted edit: deletes ADD rows, restores REMOVE rows, keeps status APPROVED (not REJECTED)', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.APPROVED,
        pendingReviewSubmittedAt: new Date('2026-08-18'),
        pendingDetails: { name: 'שם מוצע' },
        sizes: [{ id: 1, pendingAction: 'REMOVE' }, { id: 2, pendingAction: 'ADD' }],
        photos: [{ id: 9, pendingAction: 'ADD', originalUrl: '/uploads/new.jpg', processedUrl: null }],
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        status: DressStatus.APPROVED,
        rejectionReason: 'לא מתאים',
      });

      const result = await service.rejectDress(1, 'לא מתאים');

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
      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          pendingReviewSubmittedAt: null,
          rejectionReason: 'לא מתאים',
        }),
      });
      // Crucially: `status` is NOT part of the update payload here - the
      // dress itself stays APPROVED and public, only the proposed edit is
      // discarded.
      expect(prisma.dress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ status: expect.anything() }),
        }),
      );
      expect(result.status).toBe(DressStatus.APPROVED);
    });
  });

  describe('initiatePasswordReset', () => {
    it('delegates to AuthService.adminInitiatePasswordReset', async () => {
      authService.adminInitiatePasswordReset.mockResolvedValue({
        message: 'תהליך איפוס הסיסמה הופעל עבור המשתמש',
      });

      const result = await service.initiatePasswordReset(7);

      expect(authService.adminInitiatePasswordReset).toHaveBeenCalledWith(7);
      expect(result).toEqual({ message: expect.any(String) });
    });
  });
});
