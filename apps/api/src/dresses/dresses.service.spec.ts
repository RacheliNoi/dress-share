import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DressesService } from './dresses.service';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus } from '../../generated/prisma/enums';

describe('DressesService', () => {
  let service: DressesService;
  let prisma: {
    dress: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      dress: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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
        data: { status: DressStatus.PENDING_APPROVAL },
      });
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
});
