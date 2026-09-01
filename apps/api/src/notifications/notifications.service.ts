import { Injectable, Logger } from '@nestjs/common';

function formatDateHe(date: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

// Single choke point for every outbound email in the app - notif-1 swaps
// only the body of `send` for a real provider call (Resend/SendGrid, per
// biz-3); every trigger below stays untouched. Mirrors the exact
// [dev-only] console.log placeholder already used for password-reset
// emails in auth.service.ts, so both flows will move to a real provider
// together with a single change here, not two separate integrations.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private send(to: string, subject: string, body: string): void {
    // TODO(email): plug in a real email provider here (Resend/SendGrid, per
    // biz-3) instead of logging. Until then, this line is the only way to
    // observe outbound notifications in local development.
    this.logger.log(`[dev-only] Email to ${to} - ${subject}\n${body}`);
  }

  notifyNewInterest(
    ownerEmail: string,
    dressName: string,
    startDate: Date,
    endDate: Date,
  ): void {
    this.send(
      ownerEmail,
      `מישהי מתעניינת ב${dressName}`,
      `יש התעניינות חדשה בשמלה "${dressName}" לתאריכים ${formatDateHe(startDate)}–${formatDateHe(endDate)}.`,
    );
  }

  notifyNewChatMessage(recipientEmail: string, dressName: string): void {
    this.send(
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
    this.send(
      renterEmail,
      `ההתעניינות שלך ב${dressName} עומדת לפוג`,
      `ההתעניינות שלך בשמלה "${dressName}" תפוג ב-${formatDateHe(expiresAt)} אם לא תאושר השכרה עד אז.`,
    );
  }
}
