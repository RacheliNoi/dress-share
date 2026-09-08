import { Injectable, Logger } from '@nestjs/common';

const RESEND_API_URL = 'https://api.resend.com/emails';

// dressshare.co.il is verified in Resend (infra: notif-1 deploy step) - real
// recipients get real emails now, not just Resend's own testing addresses.
const FROM_ADDRESS = 'DressShare <no-reply@dressshare.co.il>';

// Mirrors apps/web/app/globals.css's design tokens exactly (--color-accent,
// --color-ink, etc.) - kept as literal hex here rather than imported, since
// this is a separate app (apps/api) with no build-time access to the
// frontend's CSS. HTML email clients (Gmail especially) strip <style>
// blocks and don't load webfonts, so every rule below is an inline style
// using only websafe fallbacks, not the site's actual Rubik/Frank Ruhl
// Libre fonts.
const COLORS = {
  ink: '#221f1f',
  inkSoft: '#6b6260',
  inkFaint: '#a89e9a',
  paper: '#fbf6f3',
  surface: '#ffffff',
  line: '#e7ddd6',
  accent: '#9c3752',
  accentDeep: '#7a2a40',
  accentLight: '#e7a6b7',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDateHe(date: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

type EmailContent = {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
};

// Branded HTML template shared by every trigger below - a plain-text
// fallback (for the dev-only console log and email clients that render
// text/plain) is built separately from `toPlainText`, so the two never
// drift out of sync with each other's content, only their formatting.
function toEmailHtml(content: EmailContent): string {
  const paragraphsHtml = content.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${COLORS.inkSoft};">${escapeHtml(paragraph)}</p>`,
    )
    .join('');

  const ctaHtml = content.cta
    ? `<a href="${content.cta.url.replace(/&/g, '&amp;')}" style="display:inline-block;margin-top:8px;padding:13px 32px;background-color:${COLORS.accent};color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;">${escapeHtml(content.cta.label)}</a>`
    : '';

  return `
    <div style="background-color:${COLORS.paper};padding:32px 16px;font-family:Rubik,Arial,Helvetica,sans-serif;">
      <div style="max-width:460px;margin:0 auto;background-color:${COLORS.surface};border-radius:20px;overflow:hidden;border:1px solid ${COLORS.line};">
        <div style="background-color:${COLORS.accent};padding:22px 32px;text-align:center;">
          <span style="font-size:20px;font-weight:700;color:#ffffff;">Dress<span style="color:${COLORS.accentLight};">Share</span></span>
        </div>
        <div dir="rtl" style="padding:32px;text-align:right;">
          <h1 style="margin:0 0 16px;font-size:19px;font-weight:700;color:${COLORS.ink};">${escapeHtml(content.heading)}</h1>
          ${paragraphsHtml}
          ${ctaHtml}
        </div>
        <div style="padding:16px 32px;background-color:${COLORS.paper};text-align:center;border-top:1px solid ${COLORS.line};">
          <span style="font-size:12px;color:${COLORS.inkFaint};">DressShare · שוק השכרת שמלות</span>
        </div>
      </div>
    </div>
  `;
}

function toPlainText(content: EmailContent): string {
  const lines = [content.heading, '', ...content.paragraphs];

  if (content.cta) {
    lines.push('', `${content.cta.label}: ${content.cta.url}`);
  }

  return lines.join('\n');
}

// Single choke point for every outbound email in the app - every trigger
// method below only ever calls `send`, never a provider directly, so a
// future provider swap, template change, or FROM_ADDRESS change touches
// one place.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private logDevOnly(to: string, subject: string, content: EmailContent): void {
    this.logger.log(
      `[dev-only] Email to ${to} - ${subject}\n${toPlainText(content)}`,
    );
  }

  // Fire-and-forget from every caller's perspective (never awaited at the
  // BookingsService/AuthService call sites) - a delivery failure must never
  // fail, or even slow down, the operation that triggered the notification.
  // Falls back to the pre-existing [dev-only] console log whenever Resend
  // isn't configured (no RESEND_API_KEY) or rejects the send (e.g. before a
  // sending domain is verified), so local development stays observable
  // either way.
  private async send(
    to: string,
    subject: string,
    content: EmailContent,
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      this.logDevOnly(to, subject, content);
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
          html: toEmailHtml(content),
          text: toPlainText(content),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.warn(
          `Resend send to ${to} failed (${response.status}): ${detail.slice(0, 300)}`,
        );
        this.logDevOnly(to, subject, content);
      }
    } catch (error) {
      this.logger.warn(
        'Resend request failed - falling back to console log',
        error instanceof Error ? error.stack : String(error),
      );
      this.logDevOnly(to, subject, content);
    }
  }

  notifyNewInterest(
    ownerEmail: string,
    dressName: string,
    startDate: Date,
    endDate: Date,
    dressUrl: string,
  ): void {
    void this.send(ownerEmail, `מישהי מתעניינת ב${dressName}`, {
      heading: `מישהי מתעניינת ב"${dressName}"`,
      paragraphs: [
        `יש התעניינות חדשה בשמלה שלך לתאריכים ${formatDateHe(startDate)}–${formatDateHe(endDate)}.`,
      ],
      cta: { label: 'לצפייה בבקשה', url: dressUrl },
    });
  }

  notifyNewChatMessage(recipientEmail: string, dressName: string): void {
    void this.send(recipientEmail, `הודעה חדשה בנוגע ל${dressName}`, {
      heading: 'הודעה חדשה',
      paragraphs: [`קיבלת הודעה חדשה בשיחה על השמלה "${dressName}".`],
    });
  }

  notifyInterestExpiringSoon(
    renterEmail: string,
    dressName: string,
    expiresAt: Date,
  ): void {
    void this.send(renterEmail, `ההתעניינות שלך ב${dressName} עומדת לפוג`, {
      heading: 'ההתעניינות שלך עומדת לפוג',
      paragraphs: [
        `ההתעניינות שלך בשמלה "${dressName}" תפוג ב-${formatDateHe(expiresAt)} אם לא תאושר השכרה עד אז.`,
      ],
    });
  }

  // The reset link itself is the entire point of this email - unlike the
  // other triggers here, there is no other way for the user to get it (the
  // raw token is never returned from any API response, by design). Still
  // fire-and-forget like the others: the caller's response is a generic
  // "if that email exists, a link was sent" regardless of delivery outcome,
  // on purpose, so this endpoint can never be used to check which emails
  // are registered.
  notifyPasswordReset(email: string, resetUrl: string): void {
    void this.send(email, 'איפוס סיסמה ל-DressShare', {
      heading: 'איפוס סיסמה',
      paragraphs: [
        'קיבלנו בקשה לאיפוס הסיסמה שלך. הקישור בתוקף ל-30 דקות.',
        'אם לא ביקשת לאפס את הסיסמה שלך, אפשר להתעלם מההודעה הזו.',
      ],
      cta: { label: 'איפוס הסיסמה', url: resetUrl },
    });
  }
}
