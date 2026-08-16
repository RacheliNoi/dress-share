import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(data: { email: string; name?: string }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
      },
    });
  }
}