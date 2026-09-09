// Used only for building links that leave the server (email bodies) -
// deliberately separate from FRONTEND_URL (main.ts's CORS origin), since
// those need different values in exactly one real scenario: local dev
// sending through a real Resend key, where FRONTEND_URL must stay the
// local frontend for CORS to keep working, but a link mailed to a real
// inbox needs the real public site instead. Falls back to FRONTEND_URL,
// then localhost - production (where they're the same URL) never needs to
// set this separately.
export function getPublicAppUrl(): string {
  return process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3000';
}
