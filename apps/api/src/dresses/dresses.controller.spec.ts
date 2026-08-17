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
