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

  private async runExpiry(): Promise<void> {
    const count = await this.bookingsService.expireStaleInterestedBookings();

    if (count > 0) {
      this.logger.log(
        `Expired ${count} INTERESTED booking(s) older than ${INTERESTED_EXPIRY_DAYS} days`,
      );
    }
  }
}
