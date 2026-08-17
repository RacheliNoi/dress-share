import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus } from '../../generated/prisma/enums';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    dress: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let authService: { adminInitiatePasswordReset: jest.Mock };

  beforeEach(async () => {
    prisma = {
      dress: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
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
    it('queries only PENDING_APPROVAL dresses', async () => {
      prisma.dress.findMany.mockResolvedValue([]);

      await service.findPendingDresses();

      expect(prisma.dress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: DressStatus.PENDING_APPROVAL },
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
