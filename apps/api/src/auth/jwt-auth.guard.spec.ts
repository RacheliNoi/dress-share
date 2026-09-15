import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

function contextWithAuthHeader(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [JwtAuthGuard, { provide: PrismaService, useValue: prisma }],
    }).compile();

    guard = module.get(JwtAuthGuard);
    jwtService = module.get(JwtService);
  });

  function tokenFor(userId: number, tokenVersion: number) {
    return jwtService.sign({ sub: userId, email: `user${userId}@test.com`, role: 'USER', tokenVersion });
  }

  it('rejects a request with no Authorization header', async () => {
    await expect(guard.canActivate(contextWithAuthHeader(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a malformed Authorization header', async () => {
    await expect(
      guard.canActivate(contextWithAuthHeader('NotBearer abc')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an invalid/garbage token', async () => {
    await expect(
      guard.canActivate(contextWithAuthHeader('Bearer not-a-real-jwt')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid token whose tokenVersion matches the current DB value', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });

    const result = await guard.canActivate(
      contextWithAuthHeader(`Bearer ${tokenFor(1, 0)}`),
    );

    expect(result).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { tokenVersion: true },
    });
  });

  // This is the actual point of tokenVersion: a token signed before a
  // "log out everywhere" or password change carries the OLD version - once
  // the DB value has moved on, that old token must stop working even
  // though it's still a validly-signed, unexpired JWT.
  it('rejects a valid token whose tokenVersion is stale (revoked via logout-all-devices)', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });

    await expect(
      guard.canActivate(contextWithAuthHeader(`Bearer ${tokenFor(1, 0)}`)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token for a user that no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextWithAuthHeader(`Bearer ${tokenFor(999, 0)}`)),
    ).rejects.toThrow(UnauthorizedException);
  });
});
