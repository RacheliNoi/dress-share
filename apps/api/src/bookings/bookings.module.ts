import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingExpiryTask } from './booking-expiry.task';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingExpiryTask],
})
export class BookingsModule {}
