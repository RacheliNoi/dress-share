import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
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

  beforeEach(async () => {
    prisma = {
      dress: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
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
        data: { status: DressStatus.APPROVED },
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
    it('rejects a PENDING_APPROVAL dress', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.PENDING_APPROVAL,
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        status: DressStatus.REJECTED,
      });

      await service.rejectDress(1);

      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: DressStatus.REJECTED },
      });
    });

    it('rejects rejecting a dress that is not PENDING_APPROVAL', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.DRAFT,
      });

      await expect(service.rejectDress(1)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.dress.update).not.toHaveBeenCalled();
    });
  });
});
