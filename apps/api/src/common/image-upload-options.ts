import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per file

// Shared between every endpoint that accepts an uploaded photo (dress
// photos, clothing-item images) - without a fileFilter/limits, Multer
// accepted any file of any type/size, which meant an attacker could store
// (and have served back, with a Content-Type taken straight from the
// attacker-controlled mimetype) an arbitrary file - e.g. HTML/SVG with an
// embedded script, a stored-XSS vector on the upload origin - and separately
// upload unbounded-size files repeatedly with no cost/resource-exhaustion
// limit at all. `storage` is intentionally left for each call site to set,
// since dress photos stay in-memory (R2/local-disk decided downstream) while
// clothing-item images write straight to disk.
export function imageUploadOptions(
  storage: MulterOptions['storage'],
): MulterOptions {
  return {
    storage,
    limits: {
      fileSize: MAX_IMAGE_FILE_SIZE_BYTES,
    },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        callback(
          new BadRequestException('ניתן להעלות קבצי תמונה בלבד (JPEG, PNG, WebP, GIF)'),
          false,
        );
        return;
      }

      callback(null, true);
    },
  };
}
