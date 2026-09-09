import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertDressExists(dressId: number) {
    const dress = await this.prisma.dress.findUnique({
      where: { id: dressId },
      select: { id: true },
    });

    if (!dress) {
      throw new NotFoundException('השמלה לא נמצאה');
    }
  }

  // Idempotent - favoriting an already-favorited dress just returns the
  // existing row, thanks to the @@unique([userId, dressId]) constraint.
  async add(userId: number, dressId: number) {
    await this.assertDressExists(dressId);

    return this.prisma.favorite.upsert({
      where: { userId_dressId: { userId, dressId } },
      create: { userId, dressId },
      update: {},
    });
  }

  // Idempotent - deleteMany on a non-existent favorite is a no-op, not an
  // error, so unfavoriting twice (e.g. a doubled click) never fails.
  async remove(userId: number, dressId: number): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, dressId } });
  }

  async listDressIds(userId: number): Promise<number[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      select: { dressId: true },
    });

    return favorites.map((favorite) => favorite.dressId);
  }
}
