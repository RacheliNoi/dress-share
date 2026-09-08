import { Test, TestingModule } from '@nestjs/testing';
import { PhotoProcessingService } from './photo-processing.service';

// A real, valid 40x40 solid-color PNG (generated via sharp itself) - needed
// for tests that exercise sharp's metadata/extract/blur/composite pipeline,
// which (unlike a mocked fetch) actually parses the image bytes and throws
// on garbage input.
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAASUlEQVRYhe3YwQkAMAxC0c7pJI7oWN2hl14e5B6QxI+eZl/mWBxS13HNO4WBlGUOJAKLg8XAYmFxsBhYLCxKixPMo4qo8mXPGlxMdQMXwbdmmAAAAABJRU5ErkJggg==',
  'base64',
);

describe('PhotoProcessingService', () => {
  let service: PhotoProcessingService;
  const originalEnv = process.env.GOOGLE_VISION_API_KEY;
  const originalFetch = global.fetch;

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

  it('returns null immediately when no API key is configured - never calls fetch', async () => {
    delete process.env.GOOGLE_VISION_API_KEY;
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the image (base64) and FACE_DETECTION feature to Vision's images:annotate, with the API key in the URL", async () => {
    const fetchMock = mockVisionResponse([]);
    global.fetch = fetchMock;

    const buffer = Buffer.from('img');
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

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

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

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toBeNull();
  });

  it('returns null (no processedUrl needed) when no faces are detected', async () => {
    const fetchMock = mockVisionResponse([]);
    global.fetch = fetchMock;

    const result = await service.enhance(REAL_PNG, 'a.jpg');

    expect(result).toBeNull();
  });

  it('returns null (never throws) when fetch itself rejects (network error)', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    global.fetch = fetchMock;

    await expect(
      service.enhance(Buffer.from('img'), 'a.jpg'),
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

    const result = await service.enhance(REAL_PNG, 'a.jpg');

    expect(result).not.toBeNull();
    expect(result).not.toEqual(REAL_PNG);
    // Still a real PNG (magic bytes intact) after the blur + re-encode.
    expect(result?.subarray(0, 8)).toEqual(REAL_PNG.subarray(0, 8));
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

    const result = await service.enhance(REAL_PNG, 'a.jpg');

    expect(result).not.toBeNull();
    expect(result).not.toEqual(REAL_PNG);
  });

  it('ignores a face annotation with no bounding box vertices, without throwing', async () => {
    const fetchMock = mockVisionResponse([{ boundingPoly: { vertices: [] } }]);
    global.fetch = fetchMock;

    const result = await service.enhance(REAL_PNG, 'a.jpg');

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
