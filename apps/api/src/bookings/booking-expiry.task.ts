import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService, INTERESTED_EXPIRY_DAYS } from './bookings.service';

// Wiring only - the actual rule (which bookings, what counts as "stale")
// lives in BookingsService.expireStaleInterestedBookings, so it can be unit
// tested without needing @nestjs/schedule's clock at all.
//
// Runs both on a daily schedule AND once on app startup (OnModuleInit).
// EVERY_DAY_AT_MIDNIGHT alone would leave stale bookings blocking their
// date/size for up to ~24h after every restart/deploy (e.g. a server that
// comes up at 14:00 waits until the next 00:00) - the startup run closes
// that gap without changing the daily cadence otherwise.
@Injectable()
export class BookingExpiryTask implements OnModuleInit {
  private readonly logger = new Logger(BookingExpiryTask.name);

  constructor(private readonly bookingsService: BookingsService) {}

  async onModuleInit(): Promise<void> {
    await this.runExpiry();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpireStaleInterested(): Promise<void> {
    await this.runExpiry();
  }

  // Swallows its own errors (logging instead of rethrowing) - this runs from
  // OnModuleInit, which is part of the app's critical boot sequence in
  // Nest: an uncaught rejection here doesn't just skip the cleanup, it
  // crashes the ENTIRE app before it ever starts listening (confirmed
  // directly - a transient DB-connection failure at boot took the whole
  // server down, not just this task). A missed cleanup run is harmless
  // (the next daily cron, or the next restart, catches up); a server that
  // can't boot because a background cleanup failed is not.
  private async runExpiry(): Promise<void> {
    try {
      const count = await this.bookingsService.expireStaleInterestedBookings();

      if (count > 0) {
        this.logger.log(
          `Expired ${count} INTERESTED booking(s) older than ${INTERESTED_EXPIRY_DAYS} days`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to expire stale INTERESTED bookings - will retry on the next scheduled run',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
