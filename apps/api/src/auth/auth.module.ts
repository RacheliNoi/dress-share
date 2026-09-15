import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NotificationsModule } from '../notifications/notifications.module';

// No fallback secret on purpose - a hardcoded default here would be visible
// to anyone who's seen this source (it's what was here before), letting
// them forge valid tokens (including admin ones) for any deployment that
// forgot to set this. Failing loudly at startup is far safer than silently
// running with a known-insecure secret.
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required (see .env.example) - refusing to start with an insecure default.',
  );
}

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: '7d',
      },
    }),
    NotificationsModule,
    // 5 requests/minute per IP on every auth route (register/login/
    // forgot-password/reset-password/change-password) - a real user never
    // needs more than that, but it's exactly what stops a bot from
    // brute-forcing logins or mass-registering/spamming reset emails.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // ThrottlerModule exported too - FeedbackModule/ReviewsModule/DressesModule
  // (all of which already import AuthModule for JwtService) reuse the same
  // ThrottlerGuard/config for their own spam/abuse-prone routes, instead of
  // each registering its own separate ThrottlerModule.forRoot(...).
  exports: [JwtModule, AuthService, ThrottlerModule],
})
export class AuthModule {}