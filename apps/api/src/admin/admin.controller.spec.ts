import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AdminModule } from './admin.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus } from '../../generated/prisma/enums';

describe('AdminController', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: {
    dress: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    passwordResetToken: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  function tokenFor(userId: number, role: 'USER' | 'ADMIN') {
    return jwtService.sign({
      sub: userId,
      email: `user${userId}@test.com`,
      role,
    });
  }

  beforeEach(async () => {
    prisma = {
      dress: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AdminModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    jwtService = moduleRef.get(JwtService);

    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  describe('GET /admin/dresses/pending', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/admin/dresses/pending')
        .expect(401);
    });

    it('rejects a USER (not an admin)', async () => {
      await request(app.getHttpServer())
        .get('/admin/dresses/pending')
        .set('Authorization', `Bearer ${tokenFor(1, 'USER')}`)
        .expect(403);
    });

    it('allows an ADMIN and returns pending dresses', async () => {
      prisma.dress.findMany.mockResolvedValue([
        { id: 1, status: DressStatus.PENDING_APPROVAL },
      ]);

      const response = await request(app.getHttpServer())
        .get('/admin/dresses/pending')
        .set('Authorization', `Bearer ${tokenFor(2, 'ADMIN')}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(prisma.dress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { status: DressStatus.PENDING_APPROVAL },
              { pendingReviewSubmittedAt: { not: null } },
            ],
          },
        }),
      );
    });
  });

  describe('PATCH /admin/dresses/:id/approve', () => {
    it('rejects a USER (not an admin)', async () => {
      await request(app.getHttpServer())
        .patch('/admin/dresses/1/approve')
        .set('Authorization', `Bearer ${tokenFor(1, 'USER')}`)
        .expect(403);

      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to approve a PENDING_APPROVAL dress', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.PENDING_APPROVAL,
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        status: DressStatus.APPROVED,
      });

      const response = await request(app.getHttpServer())
        .patch('/admin/dresses/1/approve')
        .set('Authorization', `Bearer ${tokenFor(2, 'ADMIN')}`)
        .expect(200);

      expect(response.body.status).toBe(DressStatus.APPROVED);
    });

    it('rejects approving a dress that is not PENDING_APPROVAL', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.DRAFT,
      });

      await request(app.getHttpServer())
        .patch('/admin/dresses/1/approve')
        .set('Authorization', `Bearer ${tokenFor(2, 'ADMIN')}`)
        .expect(400);

      expect(prisma.dress.update).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/dresses/:id/reject', () => {
    it('rejects a USER (not an admin), even when a reason is supplied', async () => {
      await request(app.getHttpServer())
        .patch('/admin/dresses/1/reject')
        .set('Authorization', `Bearer ${tokenFor(1, 'USER')}`)
        .send({ reason: 'לא מתאים' })
        .expect(403);

      expect(prisma.dress.update).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to reject a PENDING_APPROVAL dress with a reason, returned to the owner', async () => {
      prisma.dress.findUnique.mockResolvedValue({
        id: 1,
        status: DressStatus.PENDING_APPROVAL,
      });
      prisma.dress.update.mockResolvedValue({
        id: 1,
        status: DressStatus.REJECTED,
        rejectionReason: 'התמונות לא ברורות מספיק',
      });

      const response = await request(app.getHttpServer())
        .patch('/admin/dresses/1/reject')
        .set('Authorization', `Bearer ${tokenFor(2, 'ADMIN')}`)
        .send({ reason: 'התמונות לא ברורות מספיק' })
        .expect(200);

      expect(response.body.status).toBe(DressStatus.REJECTED);
      expect(response.body.rejectionReason).toBe('התמונות לא ברורות מספיק');
      expect(prisma.dress.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: DressStatus.REJECTED,
          rejectionReason: 'התמונות לא ברורות מספיק',
        },
      });
    });

    it('rejects an ADMIN request with no reason', async () => {
      await request(app.getHttpServer())
        .patch('/admin/dresses/1/reject')
        .set('Authorization', `Bearer ${tokenFor(2, 'ADMIN')}`)
        .send({})
        .expect(400);

      expect(prisma.dress.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/users/:id/reset-password', () => {
    it('rejects a USER (not an admin)', async () => {
      await request(app.getHttpServer())
        .post('/admin/users/5/reset-password')
        .set('Authorization', `Bearer ${tokenFor(1, 'USER')}`)
        .expect(403);

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to initiate a reset without ever seeing passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 5,
        email: 'target@test.com',
      });
      prisma.passwordResetToken.create.mockResolvedValue({});

      const response = await request(app.getHttpServer())
        .post('/admin/users/5/reset-password')
        .set('Authorization', `Bearer ${tokenFor(2, 'ADMIN')}`)
        .expect(201);

      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('token');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          select: { id: true, email: true },
        }),
      );
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    });

    it('returns 404 for a user that does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/admin/users/999/reset-password')
        .set('Authorization', `Bearer ${tokenFor(2, 'ADMIN')}`)
        .expect(404);

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });
});
