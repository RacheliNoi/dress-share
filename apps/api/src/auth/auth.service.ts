import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 30;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    name?: string;
  }) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (existingUser) {
      throw new ConflictException('משתמש עם האימייל הזה כבר קיים');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
      },
    });

    const accessToken = this.createAccessToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async login(data: {
    email: string;
    password: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('אימייל או סיסמה שגויים');
    }

    const passwordMatches = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('אימייל או סיסמה שגויים');
    }

    const accessToken = this.createAccessToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async changePassword(
    userId: number,
    data: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('משתמש לא נמצא');
    }

    const currentPasswordMatches = await bcrypt.compare(
      data.currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordMatches) {
      throw new UnauthorizedException('הסיסמה הנוכחית שגויה');
    }

    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestException('אימות הסיסמה אינו תואם לסיסמה החדשה');
    }

    this.assertPasswordIsValid(data.newPassword);

    const passwordHash = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // A password change is an implicit "I still have access" signal, so any
    // outstanding reset link becomes redundant - and leaving it usable would
    // be an unnecessary lingering way into the account.
    await this.prisma.passwordResetToken.deleteMany({ where: { userId } });

    return { message: 'הסיסמה עודכנה בהצלחה' };
  }

  async requestPasswordReset(email: string) {
    // Always return the same response whether or not the email is
    // registered, so this endpoint can't be used to enumerate accounts.
    const genericResponse = {
      message: 'אם קיים חשבון עם האימייל הזה, נשלח אליו קישור לאיפוס סיסמה',
    };

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return genericResponse;
    }

    await this.issuePasswordResetToken(user.id, user.email);

    return genericResponse;
  }

  async resetPassword(data: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestException('אימות הסיסמה אינו תואם לסיסמה החדשה');
    }

    this.assertPasswordIsValid(data.newPassword);

    const tokenHash = this.hashResetToken(data.token);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('קישור האיפוס אינו תקין או שפג תוקפו');
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      // Delete every outstanding token for this user, not just the one that
      // was used, so a token issued earlier can't still be redeemed later.
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);

    return { message: 'הסיסמה אופסה בהצלחה' };
  }

  async adminInitiatePasswordReset(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('המשתמש לא נמצא');
    }

    await this.issuePasswordResetToken(user.id, user.email);

    return { message: 'תהליך איפוס הסיסמה הופעל עבור המשתמש' };
  }

  /**
   * Shared by the self-service "forgot password" flow and the admin-initiated
   * reset - both need the exact same secure, single-use, expiring token
   * mechanism, just triggered from a different place.
   */
  private async issuePasswordResetToken(userId: number, email: string) {
    const rawToken = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashResetToken(rawToken);
    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    // A user may have only one active reset token at a time.
    await this.prisma.passwordResetToken.deleteMany({ where: { userId } });
    await this.prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    // TODO(email): plug in a real email provider here (e.g. SES/SendGrid/Resend)
    // and send `rawToken` to `email` as a link, e.g.
    // `${FRONTEND_URL}/reset-password?token=${rawToken}`.
    // The raw token is never persisted (only its hash is) and is never
    // returned from any API response - until a real email integration exists,
    // this console line is the only way to retrieve it for local development.
    console.log(
      `[dev-only] Password reset token for ${email}: ${rawToken} (expires ${expiresAt.toISOString()})`,
    );

    return rawToken;
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private assertPasswordIsValid(password: string) {
    if (!password || password.length < PASSWORD_MIN_LENGTH) {
      throw new BadRequestException(
        `הסיסמה חייבת לכלול לפחות ${PASSWORD_MIN_LENGTH} תווים`,
      );
    }

    if (!PASSWORD_PATTERN.test(password)) {
      throw new BadRequestException(
        'הסיסמה חייבת לכלול לפחות אות אחת וספרה אחת',
      );
    }
  }

  private createAccessToken(user: {
    id: number;
    email: string;
    role: string;
  }) {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }
}