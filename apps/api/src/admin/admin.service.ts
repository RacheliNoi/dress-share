import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { DressStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

type PendingDetails = {
  name?: string;
  description?: string | null;
  category?: string | null;
  color?: string | null;
};

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

  // Surfaces both brand-new dress submissions (status: PENDING_APPROVAL) and
  // edits to already-approved dresses (status stays APPROVED throughout,
  // pendingReviewSubmittedAt marks that the edit was submitted) in one
  // queue, reusing the exact same approve/reject actions for both. Full
  // (unfiltered) sizes/photos are returned - including ADD/REMOVE-flagged
  // rows - so the admin UI can show a before/after comparison for edits.
  async findPendingDresses() {
    return this.prisma.dress.findMany({
      where: {
        OR: [
          { status: DressStatus.PENDING_APPROVAL },
          { pendingReviewSubmittedAt: { not: null } },
        ],
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

  private async deleteUploadedFile(url: string) {
    const filePath = join(UPLOADS_DIR, basename(url));

    try {
      await unlink(filePath);
    } catch {
      // File already missing or inaccessible; the DB record is already gone.
    }
  }

  async approveDress(id: number) {
    const dress = await this.prisma.dress.findUnique({
      where: { id },
      include: { sizes: true, photos: true },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.status === DressStatus.PENDING_APPROVAL) {
      // Brand-new dress, first approval - unchanged from before this
      // feature existed.
      return this.prisma.dress.update({
        where: { id },
        data: {
          status: DressStatus.APPROVED,
          rejectionReason: null,
        },
      });
    }

    if (dress.status === DressStatus.APPROVED && dress.pendingReviewSubmittedAt) {
      // Applying a submitted edit to an already-approved dress: promote
      // proposed (ADD) rows to live, hard-delete removed (REMOVE) rows (and
      // their files, for photos), and apply the proposed scalar fields.
      // `status` never changes - it was APPROVED the whole time.
      const removedPhotos = dress.photos.filter(
        (photo) => photo.pendingAction === 'REMOVE',
      );
      const pending = (dress.pendingDetails as PendingDetails | null) ?? {};

      const [, , , , updated] = await this.prisma.$transaction([
        this.prisma.dressPhoto.deleteMany({
          where: { dressId: id, pendingAction: 'REMOVE' },
        }),
        this.prisma.dressSize.deleteMany({
          where: { dressId: id, pendingAction: 'REMOVE' },
        }),
        this.prisma.dressPhoto.updateMany({
          where: { dressId: id, pendingAction: 'ADD' },
          data: { pendingAction: null },
        }),
        this.prisma.dressSize.updateMany({
          where: { dressId: id, pendingAction: 'ADD' },
          data: { pendingAction: null },
        }),
        this.prisma.dress.update({
          where: { id },
          data: {
            ...pending,
            pendingDetails: Prisma.DbNull,
            pendingReviewSubmittedAt: null,
            rejectionReason: null,
          },
        }),
      ]);

      for (const photo of removedPhotos) {
        await this.deleteUploadedFile(photo.originalUrl);

        if (photo.processedUrl) {
          await this.deleteUploadedFile(photo.processedUrl);
        }
      }

      return updated;
    }

    throw new BadRequestException(
      'ניתן לאשר רק שמלות שממתינות לאישור או שיש להן עריכה ממתינה',
    );
  }

  async rejectDress(id: number, reason: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('יש לציין סיבת דחייה');
    }

    const dress = await this.prisma.dress.findUnique({
      where: { id },
      include: { sizes: true, photos: true },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.status === DressStatus.PENDING_APPROVAL) {
      // Brand-new dress, first submission rejected - unchanged from before
      // this feature existed.
      return this.prisma.dress.update({
        where: { id },
        data: {
          status: DressStatus.REJECTED,
          rejectionReason: reason.trim(),
        },
      });
    }

    if (dress.status === DressStatus.APPROVED && dress.pendingReviewSubmittedAt) {
      // Discarding a submitted edit to an already-approved dress: the dress
      // itself is still approved and public - only the proposed edit is
      // thrown away, so `status` stays APPROVED (never REJECTED). Proposed
      // (ADD) rows and their files are deleted; removed (REMOVE) rows are
      // restored to live.
      const addedPhotos = dress.photos.filter(
        (photo) => photo.pendingAction === 'ADD',
      );

      const [, , , , updated] = await this.prisma.$transaction([
        this.prisma.dressPhoto.deleteMany({
          where: { dressId: id, pendingAction: 'ADD' },
        }),
        this.prisma.dressSize.deleteMany({
          where: { dressId: id, pendingAction: 'ADD' },
        }),
        this.prisma.dressPhoto.updateMany({
          where: { dressId: id, pendingAction: 'REMOVE' },
          data: { pendingAction: null },
        }),
        this.prisma.dressSize.updateMany({
          where: { dressId: id, pendingAction: 'REMOVE' },
          data: { pendingAction: null },
        }),
        this.prisma.dress.update({
          where: { id },
          data: {
            pendingDetails: Prisma.DbNull,
            pendingReviewSubmittedAt: null,
            rejectionReason: reason.trim(),
          },
        }),
      ]);

      for (const photo of addedPhotos) {
        await this.deleteUploadedFile(photo.originalUrl);

        if (photo.processedUrl) {
          await this.deleteUploadedFile(photo.processedUrl);
        }
      }

      return updated;
    }

    throw new BadRequestException(
      'ניתן לדחות רק שמלות שממתינות לאישור או שיש להן עריכה ממתינה',
    );
  }
}
