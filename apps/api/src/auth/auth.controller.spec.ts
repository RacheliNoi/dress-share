import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AuthModule } from './auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthController', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    passwordResetToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
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
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
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

  describe('POST /auth/change-password', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          currentPassword: 'CurrentPass1',
          newPassword: 'NewPassword1',
          confirmPassword: 'NewPassword1',
        })
        .expect(401);
    });

    it('rejects the wrong current password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        passwordHash: bcrypt.hashSync('CurrentPass1', 10),
      });

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({
          currentPassword: 'WrongPass1',
          newPassword: 'NewPassword1',
          confirmPassword: 'NewPassword1',
        })
        .expect(401);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a confirmPassword mismatch', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        passwordHash: bcrypt.hashSync('CurrentPass1', 10),
      });

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({
          currentPassword: 'CurrentPass1',
          newPassword: 'NewPassword1',
          confirmPassword: 'SomethingElse1',
        })
        .expect(400);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('changes the password for the authenticated user only, and never returns passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        passwordHash: bcrypt.hashSync('CurrentPass1', 10),
      });
      prisma.user.update.mockResolvedValue({ id: 1 });

      const response = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({
          currentPassword: 'CurrentPass1',
          newPassword: 'NewPassword1',
          confirmPassword: 'NewPassword1',
        })
        .expect(201);

      expect(response.body).not.toHaveProperty('passwordHash');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('returns the same generic response whether or not the email exists', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const unknownRes = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'unknown@example.com' })
        .expect(201);

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        email: 'known@example.com',
      });
      const knownRes = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'known@example.com' })
        .expect(201);

      expect(unknownRes.body).toEqual(knownRes.body);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('rejects an invalid/unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'bogus',
          newPassword: 'NewPassword1',
          confirmPassword: 'NewPassword1',
        })
        .expect(400);
    });

    it('resets the password for a valid token and invalidates it', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        userId: 5,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue({ id: 5 });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });

      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'valid-token',
          newPassword: 'NewPassword1',
          confirmPassword: 'NewPassword1',
        })
        .expect(201);

      expect(response.body).not.toHaveProperty('passwordHash');
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 5 },
      });
    });
  });
});
