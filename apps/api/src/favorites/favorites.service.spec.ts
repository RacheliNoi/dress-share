import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FavoritesService } from './favorites.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let prisma: {
    dress: { findUnique: jest.Mock };
    favorite: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      dress: { findUnique: jest.fn() },
      favorite: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(FavoritesService);
  });

  describe('add', () => {
    it('throws NotFoundException when the dress does not exist', async () => {
      prisma.dress.findUnique.mockResolvedValue(null);

      await expect(service.add(1, 999)).rejects.toThrow(NotFoundException);
      expect(prisma.favorite.upsert).not.toHaveBeenCalled();
    });

    it('upserts on the (userId, dressId) pair so a repeat favorite is a no-op', async () => {
      prisma.dress.findUnique.mockResolvedValue({ id: 5 });
      prisma.favorite.upsert.mockResolvedValue({
        id: 1,
        userId: 1,
        dressId: 5,
      });

      await service.add(1, 5);

      expect(prisma.favorite.upsert).toHaveBeenCalledWith({
        where: { userId_dressId: { userId: 1, dressId: 5 } },
        create: { userId: 1, dressId: 5 },
        update: {},
      });
    });
  });

  describe('remove', () => {
    it('deletes the matching favorite for that user and dress', async () => {
      prisma.favorite.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(1, 5);

      expect(prisma.favorite.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1, dressId: 5 },
      });
    });

    it('does not throw when there was nothing to remove', async () => {
      prisma.favorite.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(1, 5)).resolves.toBeUndefined();
    });
  });

  describe('listDressIds', () => {
    it('returns just the dress ids for the given user', async () => {
      prisma.favorite.findMany.mockResolvedValue([
        { dressId: 5 },
        { dressId: 9 },
      ]);

      const result = await service.listDressIds(1);

      expect(result).toEqual([5, 9]);
      expect(prisma.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        select: { dressId: true },
      });
    });
  });
});
