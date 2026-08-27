import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService, INTERESTED_EXPIRY_DAYS } from './bookings.service';

// Wiring only - the actual rule (which bookings, what counts as "stale")
// lives in BookingsService.expireStaleInterestedBookings, so it can be unit
// tested without needing @nestjs/schedule's clock at all.
@Injectable()
export class BookingExpiryTask {
  private readonly logger = new Logger(BookingExpiryTask.name);

  constructor(private readonly bookingsService: BookingsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpireStaleInterested(): Promise<void> {
    const count = await this.bookingsService.expireStaleInterestedBookings();

    if (count > 0) {
      this.logger.log(
        `Expired ${count} INTERESTED booking(s) older than ${INTERESTED_EXPIRY_DAYS} days`,
      );
    }
  }
}
