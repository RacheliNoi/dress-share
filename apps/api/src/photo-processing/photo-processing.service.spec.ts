import { Test, TestingModule } from '@nestjs/testing';
import sharp from 'sharp';
import { PhotoProcessingService } from './photo-processing.service';

// A real, valid 40x40 high-contrast checkerboard PNG - its border is
// nowhere near a plain photographed backdrop (huge pixel-to-pixel color
// variance), so replaceBackdrop always no-ops on it. Used to isolate the
// face-blurring tests from the (separate) backdrop-replacement pass.
const CHECKERBOARD_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAVElEQVRYhe2XuQ0AQAjDqNl/VfcnMgToJLuiS8GXVAfCZl1nwqxLdrgTbnuMPcY9xj0evNV4q/EfB/8xei70XIO+Gn01ZqfB7NTm4yHTYHbi6+z0AB/cVygHAbAZAAAAAElFTkSuQmCC',
  'base64',
);

// A real, valid 100x100 PNG: a solid blue "backdrop" with a solid red
// "subject" (dress) square in the middle - simulates a dress on a hanger
// shot against a plain, evenly lit backdrop. Used to test replaceBackdrop.
const PLAIN_BACKDROP_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABnUlEQVR4nO3ZwY0DMQzAwC1HJbJEdeWUQQHhw/8DJz6v7G/Y19ozDT77D2htIHP4h9AOwUcIBD98IPixA8EPHAh+1EDwQwaCHy8Q/GCB4EcKBD9MIAdizIHV1Qk+QiD44QPBjx0IfuBA8KMGgh8yEPx4geAHCwQ/UiD4YQI5EGMOrK5O8BECwQ8fCH7sQPADB4IfNRD8kIHgxwsEP1gg+JECwQ8TCPt2Rlk2wtmrkw0kkG2HtEOmf1nTGdIZsh3q21dWX1nTZ+80hzSHbIPhNqk3qc+BBl2dTHdZ3WXRDnnd9nbb+zpDpveQ3kPoK+v1YtiL4WsOmd7U9Sl1e1NvUt8m9XbINKlPk3pnyDapb5N6X1nTpD5N6s0h+5+T+rQCmWM/gnYIPkIg+OEDwY8dCH7gQPCjBoIfMhD8eIHgBwsEP1Ig+GECORBjDqyuTvARAsEPHwh+7EDwAweCHzUQ/JCB4McLBD9YIPiRAsEPE8iBGHNgdXWCjxAIfvhA8GMHgh84EPyogeCHDAQ/XiD4wQLBjxQIfphADsSYA+sHYP7DlVRyho0AAAAASUVORK5CYII=',
  'base64',
);

const originalFetch = global.fetch;

async function readRawPixels(png: Buffer) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    pixelAt: (x: number, y: number) => {
      const idx = (y * info.width + x) * info.channels;
      return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
    },
  };
}

describe('PhotoProcessingService', () => {
  let service: PhotoProcessingService;
  const originalEnv = process.env.GOOGLE_VISION_API_KEY;

  beforeEach(async () => {
    process.env.GOOGLE_VISION_API_KEY = 'test-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [PhotoProcessingService],
    }).compile();

    service = module.get<PhotoProcessingService>(PhotoProcessingService);
  });

  afterEach(() => {
    process.env.GOOGLE_VISION_API_KEY = originalEnv;
    global.fetch = originalFetch;
  });

  function mockVisionResponse(faceAnnotations: unknown[]) {
    return jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          responses: [{ faceAnnotations }],
        }),
    });
  }

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('replaceBackdrop (free, local, no AI - runs regardless of Vision config)', () => {
    it('replaces a plain, evenly-colored backdrop with the studio background tone, leaving a differently-colored subject untouched', async () => {
      delete process.env.GOOGLE_VISION_API_KEY;

      const result = await service.enhance(PLAIN_BACKDROP_PNG, 'hanger.jpg');

      expect(result).not.toBeNull();
      expect(result).not.toEqual(PLAIN_BACKDROP_PNG);

      const { pixelAt } = await readRawPixels(result!);
      const corner = pixelAt(2, 2); // was the solid blue backdrop
      const center = pixelAt(50, 50); // was the solid red "dress"

      // Corner replaced with something close to the studio background tone.
      expect(Math.abs(corner.r - 251)).toBeLessThan(15);
      expect(Math.abs(corner.g - 246)).toBeLessThan(15);
      expect(Math.abs(corner.b - 243)).toBeLessThan(15);

      // Subject left basically untouched - still clearly red, not blue or
      // studio-toned.
      expect(center.r).toBeGreaterThan(150);
      expect(center.g).toBeLessThan(100);
      expect(center.b).toBeLessThan(100);
    });

    it("does nothing (returns null) when the photo's border doesn't look like a plain backdrop", async () => {
      delete process.env.GOOGLE_VISION_API_KEY;

      const result = await service.enhance(CHECKERBOARD_PNG, 'messy-room.jpg');

      expect(result).toBeNull();
    });

    it('runs the backdrop replacement even when no Vision API key is configured (it is independent of Vision)', async () => {
      delete process.env.GOOGLE_VISION_API_KEY;
      const fetchMock = jest.fn();
      global.fetch = fetchMock;

      const result = await service.enhance(PLAIN_BACKDROP_PNG, 'hanger.jpg');

      expect(result).not.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('blurDetectedFaces (Google Vision, optional/billing-gated)', () => {
    it('returns null immediately when no API key is configured - never calls fetch', async () => {
      delete process.env.GOOGLE_VISION_API_KEY;
      const fetchMock = jest.fn();
      global.fetch = fetchMock;

      const result = await service.enhance(Buffer.from('not-an-image'), 'a.jpg');

      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends the image (base64) and FACE_DETECTION feature to Vision's images:annotate, with the API key in the URL", async () => {
      const fetchMock = mockVisionResponse([]);
      global.fetch = fetchMock;

      const buffer = Buffer.from('not-an-image');
      await service.enhance(buffer, 'a.jpg');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://vision.googleapis.com/v1/images:annotate?key=test-key',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.requests[0].image.content).toBe(buffer.toString('base64'));
      expect(body.requests[0].features).toEqual([{ type: 'FACE_DETECTION' }]);
    });

    it('returns null (never throws) when Vision responds with a non-2xx status', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('{"error":"forbidden"}'),
      });
      global.fetch = fetchMock;

      const result = await service.enhance(Buffer.from('not-an-image'), 'a.jpg');

      expect(result).toBeNull();
    });

    it('returns null when Vision returns an error inside a 200 response body', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            responses: [{ error: { message: 'Bad image data.' } }],
          }),
      });
      global.fetch = fetchMock;

      const result = await service.enhance(Buffer.from('not-an-image'), 'a.jpg');

      expect(result).toBeNull();
    });

    it('returns null (no processedUrl needed) when no faces are detected', async () => {
      const fetchMock = mockVisionResponse([]);
      global.fetch = fetchMock;

      const result = await service.enhance(Buffer.from('not-an-image'), 'a.jpg');

      expect(result).toBeNull();
    });

    it('returns null (never throws) when fetch itself rejects (network error)', async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = fetchMock;

      await expect(
        service.enhance(Buffer.from('not-an-image'), 'a.jpg'),
      ).resolves.toBeNull();
    });

    it('blurs the detected face region and returns a real, different PNG', async () => {
      const fetchMock = mockVisionResponse([
        {
          boundingPoly: {
            vertices: [
              { x: 10, y: 10 },
              { x: 25, y: 10 },
              { x: 25, y: 25 },
              { x: 10, y: 25 },
            ],
          },
        },
      ]);
      global.fetch = fetchMock;

      const result = await service.enhance(CHECKERBOARD_PNG, 'a.jpg');

      expect(result).not.toBeNull();
      expect(result).not.toEqual(CHECKERBOARD_PNG);
      // Still a real PNG (magic bytes intact) after the blur + re-encode.
      expect(result?.subarray(0, 8)).toEqual(CHECKERBOARD_PNG.subarray(0, 8));
    });

    it('blurs every detected face when there is more than one', async () => {
      const fetchMock = mockVisionResponse([
        {
          boundingPoly: {
            vertices: [
              { x: 2, y: 2 },
              { x: 10, y: 2 },
              { x: 10, y: 10 },
              { x: 2, y: 10 },
            ],
          },
        },
        {
          boundingPoly: {
            vertices: [
              { x: 20, y: 20 },
              { x: 35, y: 20 },
              { x: 35, y: 35 },
              { x: 20, y: 35 },
            ],
          },
        },
      ]);
      global.fetch = fetchMock;

      const result = await service.enhance(CHECKERBOARD_PNG, 'a.jpg');

      expect(result).not.toBeNull();
      expect(result).not.toEqual(CHECKERBOARD_PNG);
    });

    it('ignores a face annotation with no bounding box vertices, without throwing', async () => {
      const fetchMock = mockVisionResponse([{ boundingPoly: { vertices: [] } }]);
      global.fetch = fetchMock;

      const result = await service.enhance(CHECKERBOARD_PNG, 'a.jpg');

      expect(result).toBeNull();
    });

    it('returns null (never throws) when the image bytes are not a real image sharp can process', async () => {
      const fetchMock = mockVisionResponse([
        {
          boundingPoly: {
            vertices: [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
              { x: 5, y: 5 },
              { x: 0, y: 5 },
            ],
          },
        },
      ]);
      global.fetch = fetchMock;

      const result = await service.enhance(Buffer.from([1, 2, 3, 4]), 'a.jpg');

      expect(result).toBeNull();
    });
  });

  describe('combined pipeline', () => {
    it('applies backdrop replacement first, then blurs a face detected in the result', async () => {
      const fetchMock = mockVisionResponse([
        {
          boundingPoly: {
            vertices: [
              { x: 45, y: 45 },
              { x: 55, y: 45 },
              { x: 55, y: 55 },
              { x: 45, y: 55 },
            ],
          },
        },
      ]);
      global.fetch = fetchMock;

      const result = await service.enhance(PLAIN_BACKDROP_PNG, 'both.jpg');

      expect(result).not.toBeNull();

      const { pixelAt } = await readRawPixels(result!);
      const corner = pixelAt(2, 2);

      // The backdrop swap still shows through outside the blurred face box.
      expect(Math.abs(corner.r - 251)).toBeLessThan(15);
      expect(Math.abs(corner.g - 246)).toBeLessThan(15);
      expect(Math.abs(corner.b - 243)).toBeLessThan(15);
    });
  });
});
