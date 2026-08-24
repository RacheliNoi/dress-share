import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus, BookingStatus } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

// Sizes/photos that are visible to the public and bookable right now: the
// live rows (pendingAction: null) plus anything an in-review edit has
// flagged for removal (REMOVE) - nothing changes publicly/bookably until
// that edit is actually approved. Rows an in-review edit has *proposed*
// (ADD) are excluded - they aren't real yet.
const LIVE_OR_PENDING_REMOVAL = {
  OR: [{ pendingAction: null }, { pendingAction: 'REMOVE' as const }],
};

const ACTIVE_BOOKING_STATUSES = [BookingStatus.INTERESTED, BookingStatus.RENTED];

type PendingDetails = {
  name?: string;
  description?: string | null;
  category?: string | null;
  color?: string | null;
};

// Mirrors the frontend's CatalogFilters SortOption exactly, so this can be
// wired straight through from a future controller @Query() without any
// translation layer.
export type CatalogSortOption = 'recommended' | 'newest' | 'price-asc' | 'price-desc';

export type FindApprovedParams = {
  search?: string;
  category?: string;
  color?: string;
  size?: string;
  priceMin?: number;
  priceMax?: number;
  sort?: CatalogSortOption;
  // 1-based. Pagination only activates when `limit` is a positive integer -
  // omitting it (or `page` alone with no `limit`) preserves the
  // pre-pagination behavior of returning every matching dress in one
  // response, exactly as findApproved() already behaved before this field
  // existed.
  page?: number;
  limit?: number;
};

@Injectable()
export class DressesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.dress.findMany({
      include: {
        sizes: true,
        photos: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Owner-only read: shows everything, including any in-progress/submitted
  // pending edit (pendingDetails, ADD/REMOVE-flagged sizes/photos), so the
  // owner can see exactly what they're proposing before/while it's reviewed.
  async findByOwner(ownerId: number) {
    return this.prisma.dress.findMany({
      where: {
        ownerId,
      },
      include: {
        sizes: true,
        photos: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Public read: `status` alone decides visibility (unchanged from before
  // this feature existed), and pendingDetails/pendingReviewSubmittedAt are
  // never selected - an in-review edit to an already-approved dress must
  // never leak to the public before an admin approves it. sizes/photos are
  // filtered to LIVE_OR_PENDING_REMOVAL for the same reason.
  //
  // All filter/sort/pagination params are optional and additive - calling
  // this with no arguments (or an empty object) produces byte-for-byte the
  // same query and ordering as before this method accepted any params at
  // all, and returns every matching dress in one response (no pagination).
  //
  // size/priceMin/priceMax are each evaluated independently against the
  // dress's applicable (LIVE_OR_PENDING_REMOVAL) sizes - matching a size
  // filter and a price filter doesn't require the same DressSize row to
  // satisfy both, mirroring how the existing client-side catalog filters in
  // app/page.tsx already treat them as independent conditions.
  //
  // Returns { dresses, total } - `total` is the count of ALL matching
  // dresses for the current search/filter/sort query, before pagination
  // slicing, so the caller can compute page count without a second request.
  async findApproved(params: FindApprovedParams = {}) {
    const { search, category, color, size, priceMin, priceMax, sort, page, limit } = params;

    const andConditions: Prisma.DressWhereInput[] = [];

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      andConditions.push({
        OR: [
          { name: { contains: trimmedSearch, mode: 'insensitive' } },
          { category: { contains: trimmedSearch, mode: 'insensitive' } },
          { color: { contains: trimmedSearch, mode: 'insensitive' } },
          { description: { contains: trimmedSearch, mode: 'insensitive' } },
        ],
      });
    }

    if (category) {
      andConditions.push({ category });
    }

    if (color) {
      andConditions.push({ color });
    }

    if (size) {
      andConditions.push({
        sizes: { some: { ...LIVE_OR_PENDING_REMOVAL, size } },
      });
    }

    if (priceMin !== undefined || priceMax !== undefined) {
      andConditions.push({
        sizes: {
          some: {
            ...LIVE_OR_PENDING_REMOVAL,
            price: {
              ...(priceMin !== undefined ? { gte: priceMin } : {}),
              ...(priceMax !== undefined ? { lte: priceMax } : {}),
            },
          },
        },
      });
    }

    const where: Prisma.DressWhereInput = {
      status: DressStatus.APPROVED,
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    };

    const select: Prisma.DressSelect = {
      id: true,
      name: true,
      description: true,
      category: true,
      color: true,
      status: true,
      rejectionReason: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      sizes: { where: LIVE_OR_PENDING_REMOVAL },
      photos: { where: LIVE_OR_PENDING_REMOVAL, orderBy: { sortOrder: 'asc' } },
    };

    // Pagination only activates when `limit` is a positive integer; `page`
    // defaults to 1 if `limit` is given without it. Both stay undefined
    // (Prisma's "no limit" shape) when `limit` is omitted, which is exactly
    // how this query already behaved before pagination existed.
    const take = limit !== undefined && limit > 0 ? limit : undefined;
    const skip = take !== undefined ? (Math.max(1, page ?? 1) - 1) * take : undefined;

    if (sort === 'price-asc' || sort === 'price-desc') {
      // Prisma has no built-in way to order - and therefore no way to
      // paginate at the DB level - a findMany by an aggregate (min/max) of a
      // to-many relation's field. Every matching dress is fetched and sorted
      // in application code exactly as before pagination existed; only the
      // requested page is then sliced off. `sorted.length` doubles as the
      // total, so no separate count query is needed for this path.
      const allMatching = await this.prisma.dress.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
      });

      const sorted = this.sortByMinSizePrice(allMatching, sort === 'price-asc' ? 1 : -1);
      const total = sorted.length;
      const dresses =
        skip !== undefined && take !== undefined ? sorted.slice(skip, skip + take) : sorted;

      return { dresses, total };
    }

    // "recommended" (the default/unset case) and "newest" both use this same
    // createdAt-desc order, which Prisma CAN paginate and count directly at
    // the DB level - run together in one round trip rather than
    // sequentially.
    const [dresses, total] = await Promise.all([
      this.prisma.dress.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.dress.count({ where }),
    ]);

    return { dresses, total };
  }

  // Sorts by each dress's cheapest applicable size price. A dress with no
  // sizes at all always sorts last, regardless of direction - mirrors
  // getMinPrice/sortedDresses in app/page.tsx exactly, so moving this sort
  // server-side later won't change what users see.
  private sortByMinSizePrice<T extends { sizes: { price: number }[] }>(
    dresses: T[],
    direction: 1 | -1,
  ): T[] {
    const withMinPrice = dresses.map((dress) => ({
      dress,
      minPrice:
        dress.sizes.length > 0 ? Math.min(...dress.sizes.map((s) => s.price)) : null,
    }));

    withMinPrice.sort((a, b) => {
      if (a.minPrice === null && b.minPrice === null) return 0;
      if (a.minPrice === null) return 1;
      if (b.minPrice === null) return -1;

      return (a.minPrice - b.minPrice) * direction;
    });

    return withMinPrice.map((entry) => entry.dress);
  }

  async create(data: {
    name: string;
    description?: string;
    category?: string;
    color?: string;
    ownerId: number;
  }) {
    return this.prisma.dress.create({
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        color: data.color,
        ownerId: data.ownerId,
        status: DressStatus.DRAFT,
      },
    });
  }

  private assertValidQuantity(quantity: number | undefined) {
    if (quantity === undefined) {
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('כמות חייבת להיות מספר שלם 1 ומעלה');
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002',
    );
  }

  // A DRAFT/REJECTED dress (never public, or previously rejected and never
  // public) can still be edited directly, exactly as before this feature.
  // A dress that's PENDING_APPROVAL (brand-new, awaiting its first
  // approval) or an APPROVED dress with an edit already submitted for
  // review cannot be edited at all - the owner must wait for the admin's
  // decision. An APPROVED dress with NO submitted edit yet is the new case
  // this feature adds: editable, but writes go through the pending
  // shadow (see each method below) rather than the live fields.
  private assertEditable(dress: {
    status: DressStatus;
    pendingReviewSubmittedAt: Date | null;
  }) {
    if (dress.status === DressStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'שמלה שממתינה לאישור לא ניתנת לעריכה ישירה',
      );
    }

    if (dress.status === DressStatus.APPROVED && dress.pendingReviewSubmittedAt) {
      throw new BadRequestException(
        'יש עריכה שכבר הוגשה לאישור מנהל - לא ניתן לערוך שוב עד להחלטה',
      );
    }
  }

  async addSize(data: {
    dressId: number;
    size: string;
    price: number;
    quantity?: number;
    ownerId: number;
  }) {
    const dress = await this.prisma.dress.findUnique({
      where: {
        id: data.dressId,
      },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.ownerId !== data.ownerId) {
      throw new ForbiddenException('אין הרשאה לערוך את השמלה הזו');
    }

    this.assertEditable(dress);
    this.assertValidQuantity(data.quantity);

    try {
      return await this.prisma.dressSize.create({
        data: {
          dressId: data.dressId,
          size: data.size,
          price: data.price,
          quantity: data.quantity ?? 1,
          pendingAction: dress.status === DressStatus.APPROVED ? 'ADD' : undefined,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('קיימת כבר מידה כזו לשמלה הזו');
      }

      throw error;
    }
  }

  async updateSize(
    dressId: number,
    sizeId: number,
    ownerId: number,
    data: { size?: string; price?: number; quantity?: number },
  ) {
    const existingSize = await this.prisma.dressSize.findUnique({
      where: {
        id: sizeId,
      },
      include: {
        dress: true,
      },
    });

    if (!existingSize || existingSize.dressId !== dressId) {
      throw new NotFoundException('המידה לא נמצאה');
    }

    if (existingSize.dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לערוך את המידה הזו');
    }

    this.assertEditable(existingSize.dress);
    this.assertValidQuantity(data.quantity);

    if (existingSize.dress.status !== DressStatus.APPROVED) {
      // DRAFT/REJECTED - direct update, unchanged behavior.
      try {
        return await this.prisma.dressSize.update({
          where: { id: sizeId },
          data: { size: data.size, price: data.price, quantity: data.quantity },
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          throw new BadRequestException('קיימת כבר מידה כזו לשמלה הזו');
        }

        throw error;
      }
    }

    if (existingSize.pendingAction === 'REMOVE') {
      throw new BadRequestException(
        'לא ניתן לערוך מידה שסומנה להסרה - יש לבטל את ההסרה קודם',
      );
    }

    if (existingSize.pendingAction === 'ADD') {
      // This row is itself an as-yet-unapproved proposal - update it
      // directly, no need for a remove+add pair.
      try {
        return await this.prisma.dressSize.update({
          where: { id: sizeId },
          data: { size: data.size, price: data.price, quantity: data.quantity },
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          throw new BadRequestException('קיימת כבר מידה כזו לשמלה הזו');
        }

        throw error;
      }
    }

    // Live row (pendingAction: null) on an approved dress - "editing" it
    // must not change what the public sees before approval, so it's
    // modeled as flagging the live row for removal and proposing a new row
    // with the edited values, rather than mutating the live row in place.
    // This applies to a quantity reduction too: lowering quantity below the
    // number of currently active bookings is allowed (existing bookings are
    // never touched or invalidated) - activeBookingsCount is returned so
    // the owner can be warned, not to block the change.
    const activeBookingsCount = await this.prisma.booking.count({
      where: {
        dressId,
        size: existingSize.size,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
    });

    try {
      const [, added] = await this.prisma.$transaction([
        this.prisma.dressSize.update({
          where: { id: sizeId },
          data: { pendingAction: 'REMOVE' },
        }),
        this.prisma.dressSize.create({
          data: {
            dressId,
            size: data.size ?? existingSize.size,
            price: data.price ?? existingSize.price,
            quantity: data.quantity ?? existingSize.quantity,
            pendingAction: 'ADD',
          },
        }),
      ]);

      return { ...added, activeBookingsCount };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('קיימת כבר מידה כזו לשמלה הזו');
      }

      throw error;
    }
  }

  async removeSize(dressId: number, sizeId: number, ownerId: number) {
    const existingSize = await this.prisma.dressSize.findUnique({
      where: {
        id: sizeId,
      },
      include: {
        dress: true,
      },
    });

    if (!existingSize || existingSize.dressId !== dressId) {
      throw new NotFoundException('המידה לא נמצאה');
    }

    if (existingSize.dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה למחוק את המידה הזו');
    }

    this.assertEditable(existingSize.dress);

    if (existingSize.dress.status !== DressStatus.APPROVED) {
      return this.prisma.dressSize.delete({ where: { id: sizeId } });
    }

    if (existingSize.pendingAction === 'ADD') {
      // Never went live - nothing to preserve, just discard the proposal.
      return this.prisma.dressSize.delete({ where: { id: sizeId } });
    }

    if (existingSize.pendingAction === 'REMOVE') {
      throw new BadRequestException('המידה כבר סומנה להסרה');
    }

    // Live row - soft-flag only, never hard-deleted here. Existing bookings
    // for this size (Booking.size is a plain snapshot, not a foreign key)
    // are completely unaffected and remain valid; this size simply won't be
    // bookable again once the edit is approved. The active-bookings count
    // is a non-blocking warning for the owner, not a restriction.
    const activeBookingsCount = await this.prisma.booking.count({
      where: {
        dressId,
        size: existingSize.size,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
    });

    const updated = await this.prisma.dressSize.update({
      where: { id: sizeId },
      data: { pendingAction: 'REMOVE' },
    });

    return { ...updated, activeBookingsCount };
  }

  // Undoes a single pending size change before the whole edit is submitted:
  // discards a not-yet-approved addition, or restores a live size that was
  // flagged for removal.
  async cancelPendingSizeChange(dressId: number, sizeId: number, ownerId: number) {
    const existingSize = await this.prisma.dressSize.findUnique({
      where: { id: sizeId },
      include: { dress: true },
    });

    if (!existingSize || existingSize.dressId !== dressId) {
      throw new NotFoundException('המידה לא נמצאה');
    }

    if (existingSize.dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לערוך את המידה הזו');
    }

    this.assertEditable(existingSize.dress);

    if (existingSize.pendingAction === 'ADD') {
      return this.prisma.dressSize.delete({ where: { id: sizeId } });
    }

    if (existingSize.pendingAction === 'REMOVE') {
      return this.prisma.dressSize.update({
        where: { id: sizeId },
        data: { pendingAction: null },
      });
    }

    throw new BadRequestException('אין שינוי ממתין לביטול עבור מידה זו');
  }

  async addPhotos(
    dressId: number,
    ownerId: number,
    files: Express.Multer.File[],
  ) {
    const dress = await this.prisma.dress.findUnique({
      where: {
        id: dressId,
      },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לערוך את השמלה הזו');
    }

    this.assertEditable(dress);

    return this.prisma.dressPhoto.createMany({
      data: files.map((file, index) => ({
        dressId,
        originalUrl: `/uploads/${file.filename}`,
        sortOrder: index,
        pendingAction: dress.status === DressStatus.APPROVED ? 'ADD' : undefined,
      })),
    });
  }

  async removePhoto(dressId: number, photoId: number, ownerId: number) {
    const photo = await this.prisma.dressPhoto.findUnique({
      where: {
        id: photoId,
      },
      include: {
        dress: true,
      },
    });

    if (!photo || photo.dressId !== dressId) {
      throw new NotFoundException('התמונה לא נמצאה');
    }

    if (photo.dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה למחוק את התמונה הזו');
    }

    this.assertEditable(photo.dress);

    if (photo.dress.status !== DressStatus.APPROVED || photo.pendingAction === 'ADD') {
      // DRAFT/REJECTED dress, or a not-yet-approved pending addition on an
      // approved dress - neither is currently public, so hard-delete + clean
      // up the file immediately, exactly as before this feature.
      const deleted = await this.prisma.dressPhoto.delete({
        where: { id: photoId },
      });

      await this.deleteUploadedFile(deleted.originalUrl);

      if (deleted.processedUrl) {
        await this.deleteUploadedFile(deleted.processedUrl);
      }

      return deleted;
    }

    if (photo.pendingAction === 'REMOVE') {
      throw new BadRequestException('התמונה כבר סומנה להסרה');
    }

    // Live photo on an approved dress - soft-flag only. The file and the
    // public gallery both stay untouched until the edit is approved.
    return this.prisma.dressPhoto.update({
      where: { id: photoId },
      data: { pendingAction: 'REMOVE' },
    });
  }

  async cancelPendingPhotoChange(dressId: number, photoId: number, ownerId: number) {
    const photo = await this.prisma.dressPhoto.findUnique({
      where: { id: photoId },
      include: { dress: true },
    });

    if (!photo || photo.dressId !== dressId) {
      throw new NotFoundException('התמונה לא נמצאה');
    }

    if (photo.dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לערוך את התמונה הזו');
    }

    this.assertEditable(photo.dress);

    if (photo.pendingAction === 'ADD') {
      const deleted = await this.prisma.dressPhoto.delete({
        where: { id: photoId },
      });

      await this.deleteUploadedFile(deleted.originalUrl);

      if (deleted.processedUrl) {
        await this.deleteUploadedFile(deleted.processedUrl);
      }

      return deleted;
    }

    if (photo.pendingAction === 'REMOVE') {
      return this.prisma.dressPhoto.update({
        where: { id: photoId },
        data: { pendingAction: null },
      });
    }

    throw new BadRequestException('אין שינוי ממתין לביטול עבור תמונה זו');
  }

  private async deleteUploadedFile(url: string) {
    const filePath = join(UPLOADS_DIR, basename(url));

    try {
      await unlink(filePath);
    } catch {
      // File already missing or inaccessible; the DB record is already gone.
    }
  }

  async submitForApproval(id: number, ownerId: number) {
    const dress = await this.prisma.dress.findUnique({
      where: {
        id,
      },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לשלוח את השמלה הזו לאישור');
    }

    if (
      dress.status !== DressStatus.DRAFT &&
      dress.status !== DressStatus.REJECTED
    ) {
      throw new BadRequestException(
        'רק שמלה שנמצאת בטיוטה או שנדחתה יכולה להישלח לאישור',
      );
    }

    return this.prisma.dress.update({
      where: {
        id,
      },
      data: {
        status: DressStatus.PENDING_APPROVAL,
        rejectionReason: null,
      },
    });
  }

  // Submits an in-progress edit to an already-APPROVED dress for admin
  // review. Unlike submitForApproval, `status` never changes - it stays
  // APPROVED the whole time, which is exactly why the public catalog
  // (findApproved, filtered on `status` alone) keeps showing the live data
  // untouched. pendingReviewSubmittedAt is what actually locks further
  // edits and surfaces this in the admin queue.
  async submitEditForApproval(id: number, ownerId: number) {
    const dress = await this.prisma.dress.findUnique({
      where: { id },
      include: { sizes: true, photos: true },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לשלוח עריכה עבור שמלה זו');
    }

    if (dress.status !== DressStatus.APPROVED) {
      throw new BadRequestException(
        'ניתן לשלוח עריכה לאישור רק עבור שמלה מאושרת',
      );
    }

    if (dress.pendingReviewSubmittedAt) {
      throw new BadRequestException('העריכה כבר הוגשה לאישור מנהל');
    }

    const hasPendingSizeOrPhoto =
      dress.sizes.some((size) => size.pendingAction !== null) ||
      dress.photos.some((photo) => photo.pendingAction !== null);
    const hasPendingDetails = dress.pendingDetails !== null;

    if (!hasPendingDetails && !hasPendingSizeOrPhoto) {
      throw new BadRequestException('אין שינויים ממתינים לשליחה');
    }

    return this.prisma.dress.update({
      where: { id },
      data: { pendingReviewSubmittedAt: new Date() },
    });
  }

  // Discards an in-progress (not-yet-submitted) edit entirely: deletes any
  // proposed (ADD) sizes/photos and their files, restores any (REMOVE)
  // flagged live sizes/photos, and clears the proposed scalar-field changes.
  // The dress reverts to exactly its current approved state.
  async cancelPendingEdit(id: number, ownerId: number) {
    const dress = await this.prisma.dress.findUnique({ where: { id } });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לבטל את העריכה של שמלה זו');
    }

    if (dress.status !== DressStatus.APPROVED) {
      throw new BadRequestException('ניתן לבטל עריכה רק עבור שמלה מאושרת');
    }

    if (dress.pendingReviewSubmittedAt) {
      throw new BadRequestException(
        'לא ניתן לבטל עריכה שכבר הוגשה לאישור - יש להמתין להחלטת מנהל',
      );
    }

    const removedPhotos = await this.prisma.dressPhoto.findMany({
      where: { dressId: id, pendingAction: 'ADD' },
    });

    await this.prisma.$transaction([
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
        data: { pendingDetails: Prisma.DbNull },
      }),
    ]);

    for (const photo of removedPhotos) {
      await this.deleteUploadedFile(photo.originalUrl);

      if (photo.processedUrl) {
        await this.deleteUploadedFile(photo.processedUrl);
      }
    }

    return this.prisma.dress.findUnique({
      where: { id },
      include: {
        sizes: true,
        photos: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async update(
    id: number,
    ownerId: number,
    data: {
      name?: string;
      description?: string;
      category?: string;
      color?: string;
    },
  ) {
    const dress = await this.prisma.dress.findUnique({
      where: {
        id,
      },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    if (dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה לערוך את השמלה הזו');
    }

    this.assertEditable(dress);

    if (dress.status === DressStatus.APPROVED) {
      const currentPending = (dress.pendingDetails as PendingDetails | null) ?? {
        name: dress.name,
        description: dress.description ?? undefined,
        category: dress.category ?? undefined,
        color: dress.color ?? undefined,
      };

      const nextPending: PendingDetails = {
        name: data.name !== undefined ? data.name : currentPending.name,
        description:
          data.description !== undefined ? data.description : currentPending.description,
        category: data.category !== undefined ? data.category : currentPending.category,
        color: data.color !== undefined ? data.color : currentPending.color,
      };

      return this.prisma.dress.update({
        where: {
          id,
        },
        data: {
          pendingDetails: nextPending,
        },
        include: {
          sizes: true,
          photos: {
            orderBy: {
              sortOrder: 'asc',
            },
          },
        },
      });
    }

    return this.prisma.dress.update({
      where: {
        id,
      },
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        color: data.color,
      },
      include: {
        sizes: true,
        photos: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });
  }

  async remove(id: number, ownerId: number) {
    const dress = await this.prisma.dress.findUnique({
      where: { id },
    });

    if (!dress || dress.ownerId !== ownerId) {
      throw new ForbiddenException('אין הרשאה למחוק את השמלה הזו');
    }

    return this.prisma.dress.delete({
      where: { id },
    });
  }
}
