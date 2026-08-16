import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClothingItemsService } from './clothing-items.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClothingItemsService', () => {
  let service: ClothingItemsService;
  let prisma: {
    clothingItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      clothingItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClothingItemsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ClothingItemsService>(ClothingItemsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByUser', () => {
    it('scopes the query to the given userId', async () => {
      prisma.clothingItem.findMany.mockResolvedValue([]);

      await service.findByUser(7);

      expect(prisma.clothingItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7 } }),
      );
    });
  });

  describe('create', () => {
    it('creates the item with the provided userId', async () => {
      prisma.clothingItem.create.mockResolvedValue({ id: 1, userId: 7 });

      await service.create({
        name: 'Dress',
        category: 'Casual',
        userId: 7,
      });

      expect(prisma.clothingItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 7 }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('deletes the item when it belongs to the given userId', async () => {
      prisma.clothingItem.findUnique.mockResolvedValue({ id: 5, userId: 7 });
      prisma.clothingItem.delete.mockResolvedValue({ id: 5, userId: 7 });

      await service.remove(5, 7);

      expect(prisma.clothingItem.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
    });

    it('throws ForbiddenException when the item belongs to another user', async () => {
      prisma.clothingItem.findUnique.mockResolvedValue({ id: 5, userId: 999 });

      await expect(service.remove(5, 7)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.clothingItem.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the item does not exist', async () => {
      prisma.clothingItem.findUnique.mockResolvedValue(null);

      await expect(service.remove(5, 7)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.clothingItem.delete).not.toHaveBeenCalled();
    });
  });
});
