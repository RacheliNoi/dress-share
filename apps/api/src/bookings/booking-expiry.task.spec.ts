import { Test, TestingModule } from '@nestjs/testing';
import { BookingExpiryTask } from './booking-expiry.task';
import { BookingsService } from './bookings.service';

describe('BookingExpiryTask', () => {
  let task: BookingExpiryTask;
  let bookingsService: { expireStaleInterestedBookings: jest.Mock };

  beforeEach(async () => {
    bookingsService = {
      expireStaleInterestedBookings: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingExpiryTask,
        { provide: BookingsService, useValue: bookingsService },
      ],
    }).compile();

    task = module.get<BookingExpiryTask>(BookingExpiryTask);
  });

  it('should be defined', () => {
    expect(task).toBeDefined();
  });

  it('runs the expiry check once on module init (startup), not just on the daily cron', async () => {
    await task.onModuleInit();

    expect(bookingsService.expireStaleInterestedBookings).toHaveBeenCalledTimes(1);
  });

  it('runs the expiry check on the scheduled cron handler too', async () => {
    await task.handleExpireStaleInterested();

    expect(bookingsService.expireStaleInterestedBookings).toHaveBeenCalledTimes(1);
  });

  it('does not throw when there is nothing to expire', async () => {
    bookingsService.expireStaleInterestedBookings.mockResolvedValue(0);

    await expect(task.onModuleInit()).resolves.not.toThrow();
  });

  // Regression test: a real DB-connection failure at boot was observed to
  // crash the entire app before it started listening, because this ran
  // unguarded from OnModuleInit (part of Nest's critical boot sequence).
  it('swallows errors from the expiry check instead of throwing (so a DB hiccup at boot never crashes the whole app)', async () => {
    bookingsService.expireStaleInterestedBookings.mockRejectedValue(
      new Error('DB connection refused'),
    );

    await expect(task.onModuleInit()).resolves.toBeUndefined();
  });

  it('swallows errors on the cron path too, not just at startup', async () => {
    bookingsService.expireStaleInterestedBookings.mockRejectedValue(
      new Error('DB connection refused'),
    );

    await expect(task.handleExpireStaleInterested()).resolves.toBeUndefined();
  });
});
