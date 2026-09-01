import { Injectable, Logger } from '@nestjs/common';

const RESEND_API_URL = 'https://api.resend.com/emails';

// TODO(deploy): resend.dev's shared sender only delivers to Resend's own
// testing addresses (verified live - an arbitrary real recipient gets a 422
// "please verify a domain" error) until a real sending domain is verified
// in the Resend dashboard. Switch this to a verified DressShare address
// once that's done - until then, `send` below falls back to the same
// [dev-only] console log used before this integration existed, so nothing
// breaks; notifications just aren't actually delivered to real inboxes yet.
const FROM_ADDRESS = 'DressShare <onboarding@resend.dev>';

function formatDateHe(date: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

// Single choke point for every outbound email in the app - every trigger
// method below only ever calls `send`, never a provider directly, so a
// future provider swap (or the FROM_ADDRESS change above) touches one place.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private logDevOnly(to: string, subject: string, body: string): void {
    this.logger.log(`[dev-only] Email to ${to} - ${subject}\n${body}`);
  }

  // Fire-and-forget from every caller's perspective (never awaited at the
  // BookingsService call sites) - a delivery failure must never fail, or
  // even slow down, the operation that triggered the notification. Falls
  // back to the pre-existing [dev-only] console log whenever Resend isn't
  // configured (no RESEND_API_KEY) or rejects the send (e.g. before a
  // sending domain is verified), so local development stays observable
  // either way.
  private async send(to: string, subject: string, body: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      this.logDevOnly(to, subject, body);
      return;
    }

    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to,
          subject,
          html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.warn(
          `Resend send to ${to} failed (${response.status}): ${detail.slice(0, 300)}`,
        );
        this.logDevOnly(to, subject, body);
      }
    } catch (error) {
      this.logger.warn(
        'Resend request failed - falling back to console log',
        error instanceof Error ? error.stack : String(error),
      );
      this.logDevOnly(to, subject, body);
    }
  }

  notifyNewInterest(
    ownerEmail: string,
    dressName: string,
    startDate: Date,
    endDate: Date,
  ): void {
    void this.send(
      ownerEmail,
      `מישהי מתעניינת ב${dressName}`,
      `יש התעניינות חדשה בשמלה "${dressName}" לתאריכים ${formatDateHe(startDate)}–${formatDateHe(endDate)}.`,
    );
  }

  notifyNewChatMessage(recipientEmail: string, dressName: string): void {
    void this.send(
      recipientEmail,
      `הודעה חדשה בנוגע ל${dressName}`,
      `קיבלת הודעה חדשה בשיחה על השמלה "${dressName}".`,
    );
  }

  notifyInterestExpiringSoon(
    renterEmail: string,
    dressName: string,
    expiresAt: Date,
  ): void {
    void this.send(
      renterEmail,
      `ההתעניינות שלך ב${dressName} עומדת לפוג`,
      `ההתעניינות שלך בשמלה "${dressName}" תפוג ב-${formatDateHe(expiresAt)} אם לא תאושר השכרה עד אז.`,
    );
  }
}
