import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClothingItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.clothingItem.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByUser(userId: number) {
    return this.prisma.clothingItem.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(data: {
    name: string;
    category: string;
    size?: string;
    color?: string;
    imageUrl?: string;
    userId: number;
  }) {
    return this.prisma.clothingItem.create({
      data: {
        name: data.name,
        category: data.category,
        size: data.size,
        color: data.color,
        imageUrl: data.imageUrl,
        userId: data.userId,
      },
    });
  }

    async remove(id: number, userId: number) {
    const item = await this.prisma.clothingItem.findUnique({
        where: {
        id,
        },
    });

    if (!item || item.userId !== userId) {
        throw new ForbiddenException('אין הרשאה למחוק את הפריט הזה');
    }

    return this.prisma.clothingItem.delete({
        where: {
        id,
        },
    });
    }
}