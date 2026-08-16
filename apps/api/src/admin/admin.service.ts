import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DressStatus } from '../../generated/prisma/enums';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.dress.update({
      where: { id },
      data: {
        status: DressStatus.APPROVED,
      },
    });
  }

  async rejectDress(id: number) {
    const dress = await this.prisma.dress.findUnique({
      where: { id },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }

    return this.prisma.dress.update({
      where: { id },
      data: {
        status: DressStatus.REJECTED,
      },
    });
  }
}