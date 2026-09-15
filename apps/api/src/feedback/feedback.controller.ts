import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FeedbackService } from './feedback.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// Public - anyone can send feedback, logged in or not (that's the whole
// point: real feedback from the public, not just registered users).
// OptionalJwtAuthGuard still attributes the submission to a logged-in
// caller when a valid token is present, leaving it anonymous otherwise.
// Rate-limited (see AuthModule's ThrottlerModule config, reused here, and
// tracked by IP regardless of login state) - without it, being open to
// anyone with no auth at all would have no spam limit whatsoever.
@UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  create(
    @Body() body: { message: string },
    @CurrentUser() user: { sub: number } | null,
  ) {
    return this.feedbackService.create(user?.sub ?? null, body?.message);
  }
}
