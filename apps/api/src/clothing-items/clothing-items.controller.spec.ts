import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { ClothingItemsModule } from './clothing-items.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

describe('ClothingItemsController', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: {
    clothingItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  function tokenFor(userId: number) {
    return jwtService.sign({
      sub: userId,
      email: `user${userId}@test.com`,
      role: 'USER',
    });
  }

  beforeEach(async () => {
    prisma = {
      clothingItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, ClothingItemsModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  describe('GET /clothing-items', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).get('/clothing-items').expect(401);
    });

    it('returns only the authenticated user\'s items', async () => {
      prisma.clothingItem.findMany.mockResolvedValue([
        { id: 1, userId: 7, name: 'Dress' },
      ]);

      await request(app.getHttpServer())
        .get('/clothing-items')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);

      expect(prisma.clothingItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7 } }),
      );
    });
  });

  describe('POST /clothing-items', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post('/clothing-items')
        .field('name', 'Dress')
        .field('category', 'Casual')
        .expect(401);
    });

    it('ignores a client-supplied userId and uses the authenticated user', async () => {
      prisma.clothingItem.create.mockResolvedValue({ id: 1, userId: 7 });

      await request(app.getHttpServer())
        .post('/clothing-items')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .field('name', 'Dress')
        .field('category', 'Casual')
        .field('userId', '999')
        .expect(201);

      expect(prisma.clothingItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 7 }),
        }),
      );
    });
  });

  describe('DELETE /clothing-items/:id', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .delete('/clothing-items/5')
        .expect(401);
    });

    it('allows deleting the user\'s own item', async () => {
      prisma.clothingItem.findUnique.mockResolvedValue({ id: 5, userId: 7 });
      prisma.clothingItem.delete.mockResolvedValue({ id: 5, userId: 7 });

      await request(app.getHttpServer())
        .delete('/clothing-items/5')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);

      expect(prisma.clothingItem.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
    });

    it('rejects deleting another user\'s item', async () => {
      prisma.clothingItem.findUnique.mockResolvedValue({
        id: 5,
        userId: 999,
      });

      await request(app.getHttpServer())
        .delete('/clothing-items/5')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(403);

      expect(prisma.clothingItem.delete).not.toHaveBeenCalled();
    });
  });
});
