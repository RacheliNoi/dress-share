import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_MESSAGE_LENGTH = 2000;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  // userId is null for an anonymous (not logged in) submission - see
  // Feedback.userId's schema comment.
  async create(userId: number | null, message: string) {
    const trimmed = (message ?? '').trim();

    if (!trimmed) {
      throw new BadRequestException('יש לכתוב משהו לפני השליחה');
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException('ההודעה ארוכה מדי');
    }

    return this.prisma.feedback.create({
      data: { userId, message: trimmed },
    });
  }
}
