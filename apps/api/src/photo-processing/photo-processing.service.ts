import { Injectable, Logger } from '@nestjs/common';

const PHOTOROOM_SEGMENT_URL = 'https://sdk.photoroom.com/v1/segment';

// v1/segment's bg_color only accepts named CSS-style colors, not hex -
// verified live against the real API ("FFFFFF" is rejected as invalid,
// named colors work) - so this is deliberately a named color, not one of
// the app's own hex design tokens. "linen" (a warm, soft off-white) was
// picked over "white" after comparing several live results side by side -
// a flat white backdrop read as clinical/product-catalog, linen reads
// closer to a boutique studio shot while staying a safe, neutral choice
// that doesn't compete with any dress color.
const BACKGROUND_COLOR = 'linen';

// Single choke point for the Photoroom integration - mirrors
// NotificationsService.send()'s "one place to swap later" shape.
@Injectable()
export class PhotoProcessingService {
  private readonly logger = new Logger(PhotoProcessingService.name);

  private get apiKey(): string | undefined {
    // TODO(deploy): PHOTOROOM_API_KEY_LIVE removes the sandbox tier's
    // tiled watermark, but costs money past 10 free edits and needs a
    // payment method on file - switching is a deliberate production
    // decision to make once, not something to default to silently.
    return process.env.PHOTOROOM_API_KEY_SANDBOX;
  }

  // Returns the enhanced image as a PNG buffer, or null if enhancement
  // wasn't possible for any reason (no API key configured, network error,
  // non-2xx/non-image response). Callers must treat null as "fall back to
  // the original upload," never as a reason to fail the whole upload -
  // Photoroom being flaky or unconfigured must never block a listing.
  async enhance(imageBuffer: Buffer, filename: string): Promise<Buffer | null> {
    const apiKey = this.apiKey;

    if (!apiKey) {
      return null;
    }

    try {
      const form = new FormData();
      form.append(
        'image_file',
        new Blob([new Uint8Array(imageBuffer)]),
        filename,
      );
      form.append('bg_color', BACKGROUND_COLOR);

      const response = await fetch(PHOTOROOM_SEGMENT_URL, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: form,
      });

      const contentType = response.headers.get('content-type') ?? '';

      if (!response.ok || !contentType.startsWith('image/')) {
        const detail = await response.text().catch(() => '');
        this.logger.warn(
          `Photoroom enhancement failed (${response.status}): ${detail.slice(0, 300)}`,
        );
        return null;
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(
        'Photoroom enhancement request failed - keeping the original photo only',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
