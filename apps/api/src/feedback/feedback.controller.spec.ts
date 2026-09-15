import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { FeedbackModule } from './feedback.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

describe('FeedbackController', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: {
    user: { findUnique: jest.Mock };
    feedback: { create: jest.Mock };
  };

  function tokenFor(userId: number) {
    return jwtService.sign({
      sub: userId,
      email: `user${userId}@test.com`,
      role: 'USER',
      tokenVersion: 0,
    });
  }

  beforeEach(async () => {
    prisma = {
      // JwtAuthGuard checks this on every authenticated request now (see
      // User.tokenVersion's schema comment) - every tokenFor() token above
      // is signed with tokenVersion: 0, so this default keeps every
      // existing authenticated-route test passing without having to touch
      // each one individually.
      user: { findUnique: jest.fn().mockResolvedValue({ tokenVersion: 0 }) },
      feedback: { create: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, FeedbackModule, AuthModule],
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

  describe('POST /feedback', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .post('/feedback')
        .send({ message: 'רעיון' })
        .expect(401);
    });

    it('400s on an empty message', async () => {
      await request(app.getHttpServer())
        .post('/feedback')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({ message: '' })
        .expect(400);

      expect(prisma.feedback.create).not.toHaveBeenCalled();
    });

    it('creates feedback under the caller userId from their own JWT', async () => {
      prisma.feedback.create.mockResolvedValue({
        id: 1,
        userId: 1,
        message: 'רעיון טוב',
      });

      await request(app.getHttpServer())
        .post('/feedback')
        .set('Authorization', `Bearer ${tokenFor(1)}`)
        .send({ message: 'רעיון טוב' })
        .expect(201);

      expect(prisma.feedback.create).toHaveBeenCalledWith({
        data: { userId: 1, message: 'רעיון טוב' },
      });
    });
  });
});
