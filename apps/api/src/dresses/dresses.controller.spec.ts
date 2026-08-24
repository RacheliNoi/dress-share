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
    it('is publicly accessible and returns only APPROVED dresses', async () => {
      prisma.dress.findMany.mockResolvedValue([
        { id: 1, status: DressStatus.APPROVED },
      ]);

      const response = await request(app.getHttpServer())
        .get('/dresses/approved')
        .expect(200);

      expect(response.body).toEqual([
        { id: 1, status: DressStatus.APPROVED },
      ]);
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

      expect(response.body.map((dress: { id: number }) => dress.id)).toEqual([2, 1]);
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
