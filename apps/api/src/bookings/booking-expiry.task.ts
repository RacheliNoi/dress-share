import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService, INTERESTED_EXPIRY_DAYS } from './bookings.service';

// Wiring only - the actual rules (which bookings are stale, which are due a
// warning) live in BookingsService, so they can be unit tested without
// needing @nestjs/schedule's clock at all.
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
    await this.runExpiryWarnings();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpireStaleInterested(): Promise<void> {
    await this.runExpiry();
    await this.runExpiryWarnings();
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

  // Same crash-safety reasoning as runExpiry above - kept as a separate
  // try/catch (not folded into runExpiry) so a failure in one never
  // suppresses the other from running on the same tick.
  private async runExpiryWarnings(): Promise<void> {
    try {
      const count = await this.bookingsService.sendExpiryWarnings();

      if (count > 0) {
        this.logger.log(`Sent ${count} interest-expiring-soon warning(s)`);
      }
    } catch (error) {
      this.logger.error(
        'Failed to send expiry warnings - will retry on the next scheduled run',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
