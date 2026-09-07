import { Test, TestingModule } from '@nestjs/testing';
import { PhotoProcessingService } from './photo-processing.service';

// A real, valid 1x1 red PNG - needed for tests that exercise the local
// sharp() touch-up pass, which (unlike a mocked fetch) actually parses the
// image bytes and throws on garbage input.
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('PhotoProcessingService', () => {
  let service: PhotoProcessingService;
  const originalEnv = process.env.PHOTOROOM_API_KEY_SANDBOX;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.PHOTOROOM_API_KEY_SANDBOX = 'test-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [PhotoProcessingService],
    }).compile();

    service = module.get<PhotoProcessingService>(PhotoProcessingService);
  });

  afterEach(() => {
    process.env.PHOTOROOM_API_KEY_SANDBOX = originalEnv;
    global.fetch = originalFetch;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns null immediately when no API key is configured - never calls fetch', async () => {
    delete process.env.PHOTOROOM_API_KEY_SANDBOX;
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies the local color/contrast/sharpen touch-up to a real segmented image', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: () => Promise.resolve(REAL_PNG.buffer.slice(REAL_PNG.byteOffset, REAL_PNG.byteOffset + REAL_PNG.byteLength)),
    });
    global.fetch = fetchMock;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).not.toBeNull();
    // The touch-up (modulate/linear/sharpen, re-encoded as PNG) changes the
    // bytes - a no-op pass-through would return the exact same buffer.
    expect(result).not.toEqual(REAL_PNG);
    // Still a real PNG (magic bytes intact) after the touch-up + re-encode.
    expect(result?.subarray(0, 8)).toEqual(REAL_PNG.subarray(0, 8));
  });

  it('falls back to the plain segmented image when the local touch-up pass fails (e.g. unparseable bytes)', async () => {
    const garbageBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: () => Promise.resolve(garbageBytes.buffer),
    });
    global.fetch = fetchMock;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toEqual(Buffer.from(garbageBytes));
  });

  it('sends the request to Photoroom v1/segment with the API key header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    global.fetch = fetchMock;

    await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sdk.photoroom.com/v1/segment',
      expect.objectContaining({
        method: 'POST',
        headers: { 'x-api-key': 'test-key' },
      }),
    );
  });

  it('returns null (never throws) when Photoroom responds with a non-2xx status', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      text: () => Promise.resolve('{"detail":"bad image"}'),
    });
    global.fetch = fetchMock;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toBeNull();
  });

  it('returns null when the response is 200 but not actually an image (defensive)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: () => Promise.resolve('{}'),
    });
    global.fetch = fetchMock;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toBeNull();
  });

  it('returns null (never throws) when fetch itself rejects (network error)', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    global.fetch = fetchMock;

    await expect(
      service.enhance(Buffer.from('img'), 'a.jpg'),
    ).resolves.toBeNull();
  });
});
