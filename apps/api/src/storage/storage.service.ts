import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

// Cloudflare R2 is S3-API-compatible, so the standard AWS SDK works against
// it unmodified - only the endpoint/region differ from real AWS S3.
// Single choke point for dress photo storage (infra-1) - mirrors
// NotificationsService/PhotoProcessingService's "one place to swap later,
// fail soft" shape: every method here returns null/false on failure rather
// than throwing, so DressesService can fall back to local disk (used
// before this integration existed) instead of failing the whole upload.
// forcePathStyle keeps the bucket name as a URL path segment rather than a
// subdomain - verified live that this doesn't change R2's behavior, but it
// does keep every request on the one hostname this app is configured with.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME ?? '';
    // No trailing slash, so key-joining below is always exactly one slash.
    this.publicUrl = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  // True only for a URL this service itself produced (the public bucket
  // domain) - used by DressesService to tell a freshly-uploaded R2 photo
  // apart from a pre-migration (or R2-was-unreachable-at-the-time) local-
  // disk photo, which still needs the old local file handling.
  isManagedUrl(url: string): boolean {
    return Boolean(this.publicUrl) && url.startsWith(`${this.publicUrl}/`);
  }

  // Returns the public URL on success, or null if R2 isn't configured or
  // the upload failed for any reason (network error, bucket/credentials
  // issue). Never throws - callers fall back to local disk on null,
  // exactly like PhotoProcessingService.enhance() falling back to "keep
  // the original" on its own failures.
  async upload(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string | null> {
    if (!this.bucket || !this.publicUrl) {
      return null;
    }

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );

      return `${this.publicUrl}/${key}`;
    } catch (error) {
      this.logger.warn(
        'R2 upload failed - falling back to local disk',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  // Returns null on failure (network error, object missing) - callers
  // decide what "couldn't read the original" means for them (e.g.
  // reprocessPhoto surfaces this as a clear error, since it's a deliberate
  // user action expecting a visible result).
  async download(url: string): Promise<Buffer | null> {
    try {
      const key = url.slice(this.publicUrl.length + 1);
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (error) {
      this.logger.warn(
        'R2 download failed',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  // Best-effort, like the existing local deleteUploadedFile - a failure
  // here (object already gone, transient network issue) is logged, not
  // thrown, since the DB record is already gone regardless.
  async delete(url: string): Promise<void> {
    try {
      const key = url.slice(this.publicUrl.length + 1);
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        'R2 delete failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
