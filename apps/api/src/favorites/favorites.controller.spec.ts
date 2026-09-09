import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { FavoritesModule } from './favorites.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

describe('FavoritesController', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: {
    dress: { findUnique: jest.Mock };
    favorite: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
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
      dress: { findUnique: jest.fn() },
      favorite: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, FavoritesModule, AuthModule],
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

  describe('GET /favorites/ids', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer()).get('/favorites/ids').expect(401);
    });

    it("returns the caller's favorited dress ids", async () => {
      prisma.favorite.findMany.mockResolvedValue([
        { dressId: 5 },
        { dressId: 9 },
      ]);

      const response = await request(app.getHttpServer())
        .get('/favorites/ids')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .expect(200);

      expect(response.body).toEqual([5, 9]);
      expect(prisma.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        select: { dressId: true },
      });
    });
  });

  describe('POST /favorites/:dressId', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer()).post('/favorites/5').expect(401);
    });

    it('404s when the dress does not exist', async () => {
      prisma.dress.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/favorites/999')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .expect(404);
    });

    it('favorites the dress on behalf of the caller from their own JWT', async () => {
      prisma.dress.findUnique.mockResolvedValue({ id: 5 });
      prisma.favorite.upsert.mockResolvedValue({
        id: 1,
        userId: 1,
        dressId: 5,
      });

      await request(app.getHttpServer())
        .post('/favorites/5')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .expect(201);

      expect(prisma.favorite.upsert).toHaveBeenCalledWith({
        where: { userId_dressId: { userId: 1, dressId: 5 } },
        create: { userId: 1, dressId: 5 },
        update: {},
      });
    });
  });

  describe('DELETE /favorites/:dressId', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer()).delete('/favorites/5').expect(401);
    });

    it('removes the favorite for the caller and dress from their own JWT', async () => {
      prisma.favorite.deleteMany.mockResolvedValue({ count: 1 });

      await request(app.getHttpServer())
        .delete('/favorites/5')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .expect(200);

      expect(prisma.favorite.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1, dressId: 5 },
      });
    });
  });
});
