import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

function contextWithAuthHeader(authorization?: string) {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: { authorization },
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let jwtService: JwtService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        OptionalJwtAuthGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    guard = module.get(OptionalJwtAuthGuard);
    jwtService = module.get(JwtService);
  });

  function tokenFor(userId: number, tokenVersion: number) {
    return jwtService.sign({
      sub: userId,
      email: `user${userId}@test.com`,
      role: 'USER',
      tokenVersion,
    });
  }

  it('never blocks a request with no Authorization header - leaves user null', async () => {
    const { context, request } = contextWithAuthHeader(undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('never blocks a malformed Authorization header - leaves user null', async () => {
    const { context, request } = contextWithAuthHeader('NotBearer abc');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeNull();
  });

  it('never blocks an invalid/garbage token - leaves user null', async () => {
    const { context, request } = contextWithAuthHeader('Bearer not-a-real-jwt');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeNull();
  });

  it('attributes the request to the caller when the token is valid and current', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
    const { context, request } = contextWithAuthHeader(
      `Bearer ${tokenFor(1, 0)}`,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 1 });
  });

  // Same tokenVersion revocation as JwtAuthGuard - the difference here is
  // this guard still lets the request through, just as if there had been
  // no token at all, rather than rejecting it outright.
  it('treats a stale (revoked) tokenVersion as anonymous, not an error', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    const { context, request } = contextWithAuthHeader(
      `Bearer ${tokenFor(1, 0)}`,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeNull();
  });

  it('treats a token for a deleted user as anonymous, not an error', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const { context, request } = contextWithAuthHeader(
      `Bearer ${tokenFor(999, 0)}`,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeNull();
  });
});
