import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus } from '../../generated/prisma/enums';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

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

    async findApproved() {
    return this.prisma.dress.findMany({
        where: {
        status: DressStatus.APPROVED,
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

async addSize(data: {
  dressId: number;
  size: string;
  price: number;
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

  if (
    dress.status === DressStatus.APPROVED ||
    dress.status === DressStatus.PENDING_APPROVAL
  ) {
    throw new BadRequestException(
      'שמלה שאושרה או ממתינה לאישור לא ניתנת לעריכה ישירה',
    );
  }

  return this.prisma.dressSize.create({
    data: {
      dressId: data.dressId,
      size: data.size,
      price: data.price,
    },
  });
}

async updateSize(
  dressId: number,
  sizeId: number,
  ownerId: number,
  data: { size?: string; price?: number },
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

  if (
    existingSize.dress.status === DressStatus.APPROVED ||
    existingSize.dress.status === DressStatus.PENDING_APPROVAL
  ) {
    throw new BadRequestException(
      'שמלה שאושרה או ממתינה לאישור לא ניתנת לעריכה ישירה',
    );
  }

  try {
    return await this.prisma.dressSize.update({
      where: {
        id: sizeId,
      },
      data: {
        size: data.size,
        price: data.price,
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
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

  if (
    existingSize.dress.status === DressStatus.APPROVED ||
    existingSize.dress.status === DressStatus.PENDING_APPROVAL
  ) {
    throw new BadRequestException(
      'שמלה שאושרה או ממתינה לאישור לא ניתנת לעריכה ישירה',
    );
  }

  return this.prisma.dressSize.delete({
    where: {
      id: sizeId,
    },
  });
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

  if (
    dress.status === DressStatus.APPROVED ||
    dress.status === DressStatus.PENDING_APPROVAL
  ) {
    throw new BadRequestException(
      'שמלה שאושרה או ממתינה לאישור לא ניתנת לעריכה ישירה',
    );
  }

  return this.prisma.dressPhoto.createMany({
    data: files.map((file, index) => ({
      dressId,
      originalUrl: `/uploads/${file.filename}`,
      sortOrder: index,
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

  if (
    photo.dress.status === DressStatus.APPROVED ||
    photo.dress.status === DressStatus.PENDING_APPROVAL
  ) {
    throw new BadRequestException(
      'שמלה שאושרה או ממתינה לאישור לא ניתנת לעריכה ישירה',
    );
  }

  const deleted = await this.prisma.dressPhoto.delete({
    where: {
      id: photoId,
    },
  });

  await this.deleteUploadedFile(deleted.originalUrl);

  if (deleted.processedUrl) {
    await this.deleteUploadedFile(deleted.processedUrl);
  }

  return deleted;
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

    if (
        dress.status === DressStatus.APPROVED ||
        dress.status === DressStatus.PENDING_APPROVAL
    ) {
        throw new BadRequestException(
        'שמלה שאושרה או ממתינה לאישור לא ניתנת לעריכה ישירה',
        );
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