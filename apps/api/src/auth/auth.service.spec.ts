import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
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

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('changePassword', () => {
    const existingHash = bcrypt.hashSync('CurrentPass1', 10);

    it('rejects when the current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        passwordHash: existingHash,
      });

      await expect(
        service.changePassword(1, {
          currentPassword: 'WrongPass1',
          newPassword: 'NewPassword1',
          confirmPassword: 'NewPassword1',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when newPassword and confirmPassword do not match', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        passwordHash: existingHash,
      });

      await expect(
        service.changePassword(1, {
          currentPassword: 'CurrentPass1',
          newPassword: 'NewPassword1',
          confirmPassword: 'Different1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a new password that fails validation (too short / no digit)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        passwordHash: existingHash,
      });

      await expect(
        service.changePassword(1, {
          currentPassword: 'CurrentPass1',
          newPassword: 'short',
          confirmPassword: 'short',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('hashes and stores the new password, and invalidates outstanding reset tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        passwordHash: existingHash,
      });
      prisma.user.update.mockResolvedValue({ id: 1 });

      const result = await service.changePassword(1, {
        currentPassword: 'CurrentPass1',
        newPassword: 'NewPassword1',
        confirmPassword: 'NewPassword1',
      });

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 1 });
      expect(updateArgs.data.passwordHash).not.toBe(existingHash);
      expect(
        bcrypt.compareSync('NewPassword1', updateArgs.data.passwordHash),
      ).toBe(true);

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(result).toEqual({ message: expect.any(String) });
    });

    it('throws when the user cannot be found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword(999, {
          currentPassword: 'CurrentPass1',
          newPassword: 'NewPassword1',
          confirmPassword: 'NewPassword1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('requestPasswordReset', () => {
    it('returns the generic response and issues a token when the email exists', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'user@example.com',
      });
      prisma.passwordResetToken.create.mockResolvedValue({});

      const result = await service.requestPasswordReset('user@example.com');

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createArgs.data.userId).toBe(1);
      expect(createArgs.data.tokenHash).toEqual(expect.any(String));
      expect(createArgs.data.expiresAt).toBeInstanceOf(Date);
      expect(result).toEqual({ message: expect.any(String) });
    });

    it('returns the exact same generic response when the email does not exist (no enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const unknown = await service.requestPasswordReset(
        'unknown@example.com',
      );
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        email: 'known@example.com',
      });
      prisma.passwordResetToken.create.mockResolvedValue({});
      const known = await service.requestPasswordReset('known@example.com');

      expect(unknown).toEqual(known);
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    });

    it('never persists the raw token, only a hash of it', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'user@example.com',
      });
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.requestPasswordReset('user@example.com');

      const storedHash =
        prisma.passwordResetToken.create.mock.calls[0][0].data.tokenHash;
      expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('resetPassword', () => {
    it('rejects mismatched newPassword/confirmPassword', async () => {
      await expect(
        service.resetPassword({
          token: 'anything',
          newPassword: 'NewPassword1',
          confirmPassword: 'Different1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'bogus-token',
          newPassword: 'NewPassword1',
          confirmPassword: 'NewPassword1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        userId: 1,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.resetPassword({
          token: 'expired-token',
          newPassword: 'NewPassword1',
          confirmPassword: 'NewPassword1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('updates the password and deletes the token(s) for a valid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        userId: 42,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue({ id: 42 });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.resetPassword({
        token: 'valid-token',
        newPassword: 'NewPassword1',
        confirmPassword: 'NewPassword1',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 42 } }),
      );
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 42 },
      });
      expect(result).toEqual({ message: expect.any(String) });
    });

    it('a token can only be used once (second use fails after deletion)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce({
        userId: 42,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue({ id: 42 });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.resetPassword({
        token: 'valid-token',
        newPassword: 'NewPassword1',
        confirmPassword: 'NewPassword1',
      });

      prisma.passwordResetToken.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.resetPassword({
          token: 'valid-token',
          newPassword: 'AnotherPass2',
          confirmPassword: 'AnotherPass2',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('adminInitiatePasswordReset', () => {
    it('issues a reset token for an existing user without exposing the passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        email: 'target@example.com',
      });
      prisma.passwordResetToken.create.mockResolvedValue({});

      const result = await service.adminInitiatePasswordReset(7);

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 7 },
          select: { id: true, email: true },
        }),
      );
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ message: expect.any(String) });
      expect(result).not.toHaveProperty('token');
      expect(result).not.toHaveProperty('resetToken');
    });

    it('throws NotFoundException for a missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.adminInitiatePasswordReset(999)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });
});
