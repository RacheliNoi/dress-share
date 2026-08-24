import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { DressesModule } from './dresses.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus } from '../../generated/prisma/enums';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('DressesController', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: {
    dress: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    dressPhoto: {
      findUnique: jest.Mock;
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
      dress: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      dressPhoto: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, DressesModule, AuthModule],
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

  describe('GET /dresses/approved', () => {
    it('is publicly accessible and returns only APPROVED dresses, plus a total count', async () => {
      prisma.dress.findMany.mockResolvedValue([
        { id: 1, status: DressStatus.APPROVED },
      ]);
      prisma.dress.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/dresses/approved')
        .expect(200);

      expect(response.body).toEqual({
        dresses: [{ id: 1, status: DressStatus.APPROVED }],
        total: 1,
      });
      expect(prisma.dress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: DressStatus.APPROVED },
        }),
      );
    });

    // 1. no query params
    it('with no query params, adds no extra AND filters (existing default behavior preserved)', async () => {
      prisma.dress.findMany.mockResolvedValue([]);

      await request(app.getHttpServer()).get('/dresses/approved').expect(200);

      const call = prisma.dress.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ status: DressStatus.APPROVED });
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    // 2. forwarding search/category/color/size
    it('forwards search, category, color, and size query params to the service', async () => {
      prisma.dress.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/dresses/approved')
        .query({ search: 'ערב', category: 'קוקטייל', color: 'אדום', size: 'M' })
        .expect(200);

      const call = prisma.dress.findMany.mock.calls[0][0];
      expect(call.where.AND).toEqual([
        {
          OR: [
            { name: { contains: 'ערב', mode: 'insensitive' } },
            { category: { contains: 'ערב', mode: 'insensitive' } },
            { color: { contains: 'ערב', mode: 'insensitive' } },
            { description: { contains: 'ערב', mode: 'insensitive' } },
          ],
        },
        { category: 'קוקטייל' },
        { color: 'אדום' },
        {
          sizes: {
            some: {
              OR: [{ pendingAction: null }, { pendingAction: 'REMOVE' }],
              size: 'M',
            },
          },
        },
      ]);
    });

    // 3. forwarding priceMin/priceMax
    it('parses and forwards priceMin/priceMax query params as integers', async () => {
      prisma.dress.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/dresses/approved')
        .query({ priceMin: '200', priceMax: '500' })
        .expect(200);

      const call = prisma.dress.findMany.mock.calls[0][0];
      expect(call.where.AND).toEqual([
        {
          sizes: {
            some: {
              OR: [{ pendingAction: null }, { pendingAction: 'REMOVE' }],
              price: { gte: 200, lte: 500 },
            },
          },
        },
      ]);
    });

    it('treats a non-numeric priceMin/priceMax as not provided rather than erroring', async () => {
      prisma.dress.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/dresses/approved')
        .query({ priceMin: 'not-a-number', priceMax: '12.5' })
        .expect(200);

      const call = prisma.dress.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ status: DressStatus.APPROVED });
    });

    // 4. forwarding sort
    it('forwards sort=price-asc and returns dresses ordered by cheapest size price', async () => {
      prisma.dress.findMany.mockResolvedValue([
        { id: 1, sizes: [{ price: 500 }] },
        { id: 2, sizes: [{ price: 100 }] },
      ]);

      const response = await request(app.getHttpServer())
        .get('/dresses/approved')
        .query({ sort: 'price-asc' })
        .expect(200);

      expect(response.body.dresses.map((dress: { id: number }) => dress.id)).toEqual([2, 1]);
      expect(response.body.total).toBe(2);
    });

    it('forwards sort=newest using the same createdAt-desc DB order', async () => {
      prisma.dress.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/dresses/approved')
        .query({ sort: 'newest' })
        .expect(200);

      expect(prisma.dress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    // 5. route remains publicly accessible
    it('remains publicly accessible (no Authorization header) even with query params supplied', async () => {
      prisma.dress.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/dresses/approved')
        .query({ search: 'x', category: 'y', priceMin: '10' })
        .expect(200);
    });

    describe('pagination', () => {
      it('forwards page/limit as skip/take, and total reflects the full match count, not the page size', async () => {
        prisma.dress.findMany.mockResolvedValue([{ id: 21 }, { id: 22 }]);
        prisma.dress.count.mockResolvedValue(47);

        const response = await request(app.getHttpServer())
          .get('/dresses/approved')
          .query({ page: '3', limit: '10' })
          .expect(200);

        expect(prisma.dress.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ skip: 20, take: 10 }),
        );
        expect(response.body.dresses).toEqual([{ id: 21 }, { id: 22 }]);
        expect(response.body.total).toBe(47);
      });

      it('page 1 and page 2 request different skip offsets (different pages of results)', async () => {
        prisma.dress.count.mockResolvedValue(20);

        prisma.dress.findMany.mockResolvedValueOnce([{ id: 1 }]);
        await request(app.getHttpServer())
          .get('/dresses/approved')
          .query({ page: '1', limit: '5' })
          .expect(200);

        prisma.dress.findMany.mockResolvedValueOnce([{ id: 2 }]);
        await request(app.getHttpServer())
          .get('/dresses/approved')
          .query({ page: '2', limit: '5' })
          .expect(200);

        const skips = prisma.dress.findMany.mock.calls.map((call) => call[0].skip);
        expect(skips).toEqual([0, 5]);
      });

      it('with no page/limit, returns everything unpaginated (existing behavior preserved)', async () => {
        prisma.dress.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
        prisma.dress.count.mockResolvedValue(3);

        const response = await request(app.getHttpServer())
          .get('/dresses/approved')
          .expect(200);

        expect(prisma.dress.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ skip: undefined, take: undefined }),
        );
        expect(response.body.dresses).toHaveLength(3);
        expect(response.body.total).toBe(3);
      });

      it('a non-numeric page/limit is treated as not provided (no pagination), matching priceMin/priceMax\'s existing safe-parsing behavior', async () => {
        prisma.dress.findMany.mockResolvedValue([]);
        prisma.dress.count.mockResolvedValue(0);

        await request(app.getHttpServer())
          .get('/dresses/approved')
          .query({ page: 'abc', limit: 'xyz' })
          .expect(200);

        expect(prisma.dress.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ skip: undefined, take: undefined }),
        );
      });

      it('combines pagination with filters/sort in one request', async () => {
        prisma.dress.findMany.mockResolvedValue([{ id: 5, sizes: [{ price: 200 }] }]);

        const response = await request(app.getHttpServer())
          .get('/dresses/approved')
          .query({ category: 'ערב', sort: 'price-asc', page: '1', limit: '2' })
          .expect(200);

        const call = prisma.dress.findMany.mock.calls[0][0];
        expect(call.where.AND).toEqual([{ category: 'ערב' }]);
        expect(response.body.dresses).toEqual([{ id: 5, sizes: [{ price: 200 }] }]);
        expect(response.body.total).toBe(1);
      });
    });
  });

  describe('POST /dresses/:id/submit', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post('/dresses/1/submit')
        .expect(401);
    });

    it('allows the owner to submit their own DRAFT dress', async () => {
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

      const response = await request(app.getHttpServer())
        .post('/dresses/1/submit')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(201);

      expect(response.body.status).toBe(DressStatus.PENDING_APPROVAL);
      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: DressStatus.PENDING_APPROVAL, rejectionReason: null },
      });
    });

    it('allows resubmitting the owner\'s own REJECTED dress', async () => {
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

      const response = await request(app.getHttpServer())
        .post('/dresses/1/submit')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(201);

      expect(response.body.status).toBe(DressStatus.PENDING_APPROVAL);
      expect(response.body.rejectionReason).toBeNull();
    });

    it("rejects submitting another user's dress", async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 999,
        status: DressStatus.DRAFT,
      });

      await request(app.getHttpServer())
        .post('/dresses/1/submit')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(403);

      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('rejects submitting a dress that is not DRAFT', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        ownerId: 7,
        status: DressStatus.PENDING_APPROVAL,
      });

      await request(app.getHttpServer())
        .post('/dresses/1/submit')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(400);

      expect(prisma.dress.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /dresses/:id/photos/:photoId', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .delete('/dresses/1/photos/5')
        .expect(401);
    });

    it('allows the owner to delete their own photo', async () => {
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

      const response = await request(app.getHttpServer())
        .delete('/dresses/1/photos/5')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(200);

      expect(response.body.id).toBe(5);
      expect(prisma.dressPhoto.delete).toHaveBeenCalledWith({
        where: { id: 5 },
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

      await request(app.getHttpServer())
        .delete('/dresses/1/photos/5')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(403);

      expect(prisma.dressPhoto.delete).not.toHaveBeenCalled();
    });

    it('returns 404 for a photo that does not exist', async () => {
      prisma.dressPhoto.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/dresses/1/photos/999')
        .set('Authorization', `Bearer ${tokenFor(7)}`)
        .expect(404);

      expect(prisma.dressPhoto.delete).not.toHaveBeenCalled();
    });
  });
});
