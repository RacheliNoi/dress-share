import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { DressStatus } from '../../generated/prisma/enums';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // Delegates to the same secure, single-use, expiring reset-token mechanism
  // used by the self-service "forgot password" flow, rather than a separate
  // admin-only path that could set (or reveal) a password directly.
  async initiatePasswordReset(userId: number) {
    return this.authService.adminInitiatePasswordReset(userId);
  }

  async findPendingDresses() {
    return this.prisma.dress.findMany({
      where: {
        status: DressStatus.PENDING_APPROVAL,
      },
      include: {
        sizes: true,
        photos: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async approveDress(id: number) {
    const dress = await this.prisma.dress.findUnique({
      where: { id },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.status !== DressStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'ניתן לאשר רק שמלות שממתינות לאישור',
      );
    }

    return this.prisma.dress.update({
      where: { id },
      data: {
        status: DressStatus.APPROVED,
        rejectionReason: null,
      },
    });
  }

  async rejectDress(id: number, reason: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('יש לציין סיבת דחייה');
    }

    const dress = await this.prisma.dress.findUnique({
      where: { id },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.status !== DressStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'ניתן לדחות רק שמלות שממתינות לאישור',
      );
    }

    return this.prisma.dress.update({
      where: { id },
      data: {
        status: DressStatus.REJECTED,
        rejectionReason: reason.trim(),
      },
    });
  }
}