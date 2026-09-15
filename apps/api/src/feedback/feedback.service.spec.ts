import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let prisma: {
    feedback: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      feedback: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(FeedbackService);
  });

  describe('create', () => {
    it('throws BadRequestException for an empty message', async () => {
      await expect(service.create(1, '')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.feedback.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a whitespace-only message', async () => {
      await expect(service.create(1, '   ')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.feedback.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a message over 2000 characters', async () => {
      await expect(service.create(1, 'א'.repeat(2001))).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.feedback.create).not.toHaveBeenCalled();
    });

    it('trims the message and creates it under the caller userId', async () => {
      prisma.feedback.create.mockResolvedValue({
        id: 1,
        userId: 1,
        message: 'רעיון טוב',
      });

      await service.create(1, '  רעיון טוב  ');

      expect(prisma.feedback.create).toHaveBeenCalledWith({
        data: { userId: 1, message: 'רעיון טוב' },
      });
    });

    it('creates anonymous feedback (userId: null) for a caller who is not logged in', async () => {
      prisma.feedback.create.mockResolvedValue({
        id: 1,
        userId: null,
        message: 'רעיון',
      });

      await service.create(null, 'רעיון');

      expect(prisma.feedback.create).toHaveBeenCalledWith({
        data: { userId: null, message: 'רעיון' },
      });
    });
  });
});
