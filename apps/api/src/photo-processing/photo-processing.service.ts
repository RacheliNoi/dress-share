import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

// Vision's face box is tight to facial features (eyes/nose/mouth) - it
// doesn't cover the whole head. Padding (as a fraction of the box's own
// width/height) expands it so the blur actually covers forehead/jaw/ears
// too, not just the center of the face.
const FACE_BOX_PADDING = 0.35;

type Vertex = { x?: number; y?: number };
type FaceAnnotation = { boundingPoly?: { vertices?: Vertex[] } };

// Single choke point for the "protect whoever is wearing the dress" pass -
// mirrors NotificationsService/StorageService's "one place to swap later,
// fail soft" shape. Blurs every detected face and leaves everything else in
// the photo untouched (swapped in for the previous Photoroom background-
// swap approach, which didn't look good enough to ship - this stays until a
// more flattering treatment is found).
@Injectable()
export class PhotoProcessingService {
  private readonly logger = new Logger(PhotoProcessingService.name);

  private get apiKey(): string | undefined {
    return process.env.GOOGLE_VISION_API_KEY;
  }

  // Returns the blurred image as a PNG buffer, or null if there's nothing
  // to apply - no API key configured, no faces detected, or the
  // request/processing itself failed. Callers must treat null as "fall
  // back to the original upload," never as a reason to fail the whole
  // upload - Vision being flaky, unconfigured, or finding no face must
  // never block a listing.
  async enhance(imageBuffer: Buffer, filename: string): Promise<Buffer | null> {
    const apiKey = this.apiKey;

    if (!apiKey) {
      return null;
    }

    try {
      const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBuffer.toString('base64') },
              features: [{ type: 'FACE_DETECTION' }],
            },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.warn(
          `Vision face detection failed (${response.status}): ${detail.slice(0, 300)}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        responses?: Array<{
          faceAnnotations?: FaceAnnotation[];
          error?: { message?: string };
        }>;
      };

      const result = data.responses?.[0];

      if (result?.error) {
        this.logger.warn(`Vision face detection error: ${result.error.message}`);
        return null;
      }

      const faces = result?.faceAnnotations ?? [];

      if (faces.length === 0) {
        return null;
      }

      return await this.blurFaces(imageBuffer, faces, filename);
    } catch (error) {
      this.logger.warn(
        'Vision face detection request failed - keeping the original photo only',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  private async blurFaces(
    imageBuffer: Buffer,
    faces: FaceAnnotation[],
    filename: string,
  ): Promise<Buffer | null> {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const imageWidth = metadata.width ?? 0;
      const imageHeight = metadata.height ?? 0;

      const overlays = (
        await Promise.all(
          faces.map((face) => this.buildBlurredFaceOverlay(imageBuffer, face, imageWidth, imageHeight)),
        )
      ).filter((overlay): overlay is sharp.OverlayOptions => overlay !== null);

      if (overlays.length === 0) {
        return null;
      }

      return await sharp(imageBuffer).composite(overlays).png().toBuffer();
    } catch (error) {
      this.logger.warn(
        `Blurring detected faces failed for ${filename} - keeping the original photo only`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  private async buildBlurredFaceOverlay(
    imageBuffer: Buffer,
    face: FaceAnnotation,
    imageWidth: number,
    imageHeight: number,
  ): Promise<sharp.OverlayOptions | null> {
    const vertices = face.boundingPoly?.vertices ?? [];

    if (vertices.length === 0) {
      return null;
    }

    const xs = vertices.map((vertex) => vertex.x ?? 0);
    const ys = vertices.map((vertex) => vertex.y ?? 0);

    const rawLeft = Math.min(...xs);
    const rawTop = Math.min(...ys);
    const rawWidth = Math.max(...xs) - rawLeft;
    const rawHeight = Math.max(...ys) - rawTop;
    const padX = rawWidth * FACE_BOX_PADDING;
    const padY = rawHeight * FACE_BOX_PADDING;

    const left = Math.max(0, Math.round(rawLeft - padX));
    const top = Math.max(0, Math.round(rawTop - padY));
    const width = Math.min(imageWidth - left, Math.round(rawWidth + padX * 2));
    const height = Math.min(imageHeight - top, Math.round(rawHeight + padY * 2));

    if (width <= 0 || height <= 0) {
      return null;
    }

    // Blur radius scales with the face size - a fixed radius would barely
    // obscure a large close-up face or look excessive on a tiny distant one.
    const blurSigma = Math.max(15, Math.round(Math.max(width, height) / 4));

    const region = await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .blur(blurSigma)
      .toBuffer();

    return { input: region, left, top };
  }
}
