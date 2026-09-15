import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // Rate-limited (see AuthModule's ThrottlerModule config, reused here) -
  // the unique-review-per-booking constraint already blocks real spam, but
  // there was no limit at all on how fast someone could hammer this route.
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Post()
  create(
    @Body() body: { bookingId: number; rating: number; comment?: string },
    @CurrentUser() user: { sub: number },
  ) {
    return this.reviewsService.create(
      user.sub,
      body.bookingId,
      body.rating,
      body.comment,
    );
  }

  // Public, unauthenticated - a dress's reviews are shown on its own public
  // detail page.
  @Get()
  list(@Query('dressId') dressId: string) {
    return this.reviewsService.listForDress(Number(dressId));
  }
}
