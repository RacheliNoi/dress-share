// Only supplies the one env var every test needs just to bootstrap
// AuthModule (which now refuses to start without JWT_SECRET, see
// auth.module.ts) - deliberately NOT a full `dotenv/config` load of the
// real .env file, since that would also pull in real third-party API keys
// (Resend, Photoroom, Google Vision) and change service behavior mid-test
// (e.g. NotificationsService branches on whether RESEND_API_KEY is set).
process.env.JWT_SECRET ??= 'test-jwt-secret-do-not-use-in-real-deployments';
