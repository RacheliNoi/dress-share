import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { UsersModule } from './users.module';

// Guards against the authorization gap fixed in this change: GET /users
// (a full user listing, previously reachable by anyone with no token at
// all) must now require a valid JWT AND an ADMIN role, exactly like
// AdminController.
describe('UsersController', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: {
    user: {
      findMany: jest.Mock;
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
      user: {
        findMany: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, UsersModule, AuthModule],
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

  describe('GET /users', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('rejects a regular USER (not an admin)', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokenFor(1, 'USER')}`)
        .expect(403);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('allows an ADMIN and never returns passwordHash', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          email: 'admin@test.com',
          name: 'Admin',
          role: 'ADMIN',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokenFor(2, 'ADMIN')}`)
        .expect(200);

      expect(response.body).toHaveLength(1);

      for (const user of response.body) {
        expect(user).not.toHaveProperty('passwordHash');
      }

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      );
    });
  });
});
