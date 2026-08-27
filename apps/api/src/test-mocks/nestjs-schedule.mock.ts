// Manual Jest mock for @nestjs/schedule (wired via moduleNameMapper in
// package.json). The real package ships ESM-only (package.json
// "type": "module"), which Jest's CJS-based test runtime can't require() -
// even though it works fine under the app's real runtime (Node's native
// require(ESM) interop) and under ts-node/nest build. No test in this suite
// exercises real cron firing: BookingExpiryTask's actual logic lives in and
// is tested via BookingsService.expireStaleInterestedBookings, which has no
// dependency on this package at all. This stub only needs to satisfy the
// decorator/DI wiring so BookingsModule (and anything that transitively
// imports it, e.g. controller specs) can load under Jest.
export function Cron(..._args: unknown[]): MethodDecorator {
  return () => undefined;
}

export const CronExpression = {
  EVERY_DAY_AT_MIDNIGHT: '0 0 * * *',
} as const;

export class ScheduleModule {
  static forRoot() {
    return { module: ScheduleModule };
  }
}
