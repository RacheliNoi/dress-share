import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

// Vision's face box is tight to facial features (eyes/nose/mouth) - it
// doesn't cover the whole head. Padding (as a fraction of the box's own
// width/height) expands it so the blur actually covers forehead/jaw/ears
// too, not just the center of the face.
const FACE_BOX_PADDING = 0.35;

// --- Backdrop replacement (chroma-key style) tuning ---
// A plain, fairly saturated backdrop color (blue/green, not white - a light
// dress would blend into a white backdrop) photographed evenly lets this
// swap the backdrop for a clean studio tone entirely locally, no AI/network
// call, no per-photo cost, no volume limit - unlike the face-blur pass
// below. Falls back to leaving the photo untouched if the border doesn't
// look like a plain backdrop (real room clutter varies far more in color
// than an evenly lit sheet/board does), so it never mangles a photo taken
// without one.
const BORDER_SAMPLE_FRACTION = 0.05;
const BORDER_MIN_MARGIN_PX = 4;
const MAX_BORDER_COLOR_SPREAD = 28;
const BACKDROP_COLOR_TOLERANCE = 30;
const BACKDROP_FEATHER = 35;
// Matches the brand's warm off-white (notifications' email template
// COLORS.paper, #fbf6f3) rather than a clinical pure white.
const STUDIO_BACKGROUND = { r: 251, g: 246, b: 243 };
// Above this, a per-pixel JS loop over a full-resolution phone photo gets
// slow enough to not be worth it for an upload request - skip rather than
// stall the response.
const MAX_BACKDROP_PIXELS = 4_000_000;

type Vertex = { x?: number; y?: number };
type FaceAnnotation = { boundingPoly?: { vertices?: Vertex[] } };
type RgbColor = { r: number; g: number; b: number };

// Single choke point for "make an uploaded dress photo presentable" -
// mirrors NotificationsService/StorageService's "one place to swap later,
// fail soft" shape. Two independent passes, both optional and never
// blocking the upload if they don't apply or fail:
//  1. replaceBackdrop - free, local, no AI - swaps a plain photographed
//     backdrop for a clean studio tone (for dresses shot on a hanger).
//  2. blurDetectedFaces - Google Vision - blurs any face found (privacy for
//     whoever is wearing the dress). Requires billing enabled on the
//     Vision project; kept in the code (not removed) even though the
//     background-swap-only path above covers today's actual need, since
//     it's a real upgrade path once that's turned on.
// Runs backdrop replacement first, then face-blurring on whatever result
// that produced - a hanger shot gets just the backdrop swapped, a worn
// photo (no plain backdrop to key out) gets just its face blurred, and a
// worn photo shot in front of a plain backdrop gets both.
@Injectable()
export class PhotoProcessingService {
  private readonly logger = new Logger(PhotoProcessingService.name);

  async enhance(imageBuffer: Buffer, filename: string): Promise<Buffer | null> {
    const backdropReplaced = await this.replaceBackdrop(imageBuffer, filename);
    const blurred = await this.blurDetectedFaces(backdropReplaced ?? imageBuffer, filename);
    return blurred ?? backdropReplaced;
  }

  private async replaceBackdrop(imageBuffer: Buffer, filename: string): Promise<Buffer | null> {
    try {
      const { data, info } = await sharp(imageBuffer)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height, channels } = info;

      if (!width || !height || channels < 3 || width * height > MAX_BACKDROP_PIXELS) {
        return null;
      }

      const margin = Math.max(
        BORDER_MIN_MARGIN_PX,
        Math.round(Math.min(width, height) * BORDER_SAMPLE_FRACTION),
      );

      const borderPixels = this.collectBorderPixels(data, width, height, channels, margin);
      const backdropColor = this.averageColor(borderPixels);
      const spread = this.averageColorDistance(borderPixels, backdropColor);

      if (spread > MAX_BORDER_COLOR_SPREAD) {
        // Border isn't consistent enough to be a plain photographed
        // backdrop (real room clutter, patterned wall, etc.) - leave the
        // photo untouched rather than guessing.
        return null;
      }

      const output = Buffer.from(data);

      for (let pixel = 0; pixel < width * height; pixel++) {
        const idx = pixel * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const distance = this.colorDistance({ r, g, b }, backdropColor);

        let alpha: number;
        if (distance <= BACKDROP_COLOR_TOLERANCE) {
          alpha = 0;
        } else if (distance >= BACKDROP_COLOR_TOLERANCE + BACKDROP_FEATHER) {
          alpha = 1;
        } else {
          alpha = (distance - BACKDROP_COLOR_TOLERANCE) / BACKDROP_FEATHER;
        }

        output[idx] = Math.round(r * alpha + STUDIO_BACKGROUND.r * (1 - alpha));
        output[idx + 1] = Math.round(g * alpha + STUDIO_BACKGROUND.g * (1 - alpha));
        output[idx + 2] = Math.round(b * alpha + STUDIO_BACKGROUND.b * (1 - alpha));
      }

      return await sharp(output, { raw: { width, height, channels } }).png().toBuffer();
    } catch (error) {
      this.logger.warn(
        `Backdrop replacement failed for ${filename} - keeping the original photo only`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  private collectBorderPixels(
    data: Buffer,
    width: number,
    height: number,
    channels: number,
    margin: number,
  ): RgbColor[] {
    const pixels: RgbColor[] = [];

    const pushPixel = (x: number, y: number) => {
      const idx = (y * width + x) * channels;
      pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    };

    for (let y = 0; y < height; y++) {
      const isTopOrBottomBand = y < margin || y >= height - margin;
      const xStep = isTopOrBottomBand ? 1 : Math.max(1, width - 2 * margin);

      for (let x = 0; x < width; x += xStep) {
        if (isTopOrBottomBand || x < margin || x >= width - margin) {
          pushPixel(x, y);
        }
      }
    }

    return pixels;
  }

  private averageColor(pixels: RgbColor[]): RgbColor {
    const total = pixels.reduce(
      (sum, pixel) => ({ r: sum.r + pixel.r, g: sum.g + pixel.g, b: sum.b + pixel.b }),
      { r: 0, g: 0, b: 0 },
    );

    return {
      r: total.r / pixels.length,
      g: total.g / pixels.length,
      b: total.b / pixels.length,
    };
  }

  private averageColorDistance(pixels: RgbColor[], from: RgbColor): number {
    const total = pixels.reduce((sum, pixel) => sum + this.colorDistance(pixel, from), 0);
    return total / pixels.length;
  }

  private colorDistance(a: RgbColor, b: RgbColor): number {
    return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  }

  private get visionApiKey(): string | undefined {
    return process.env.GOOGLE_VISION_API_KEY;
  }

  // Returns the blurred image as a PNG buffer, or null if there's nothing
  // to apply - no API key configured, no faces detected, or the
  // request/processing itself failed. Never blocks the upload - Vision
  // being flaky, unconfigured, or finding no face must never fail it.
  private async blurDetectedFaces(imageBuffer: Buffer, filename: string): Promise<Buffer | null> {
    const apiKey = this.visionApiKey;

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
