import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FeedbackService } from './feedback.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// Rate-limited (see AuthModule's ThrottlerModule config, reused here) -
// without it, a logged-in user could spam the admin feedback inbox with no
// limit at all.
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  create(
    @Body() body: { message: string },
    @CurrentUser() user: { sub: number },
  ) {
    return this.feedbackService.create(user.sub, body?.message);
  }
}
