import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard)
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
