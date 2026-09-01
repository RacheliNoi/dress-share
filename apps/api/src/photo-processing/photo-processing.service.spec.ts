import { Test, TestingModule } from '@nestjs/testing';
import { PhotoProcessingService } from './photo-processing.service';

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
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the enhanced image bytes on a successful response', async () => {
    const enhancedBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => enhancedBytes.buffer,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toEqual(Buffer.from(enhancedBytes));
  });

  it('sends the request to Photoroom v1/segment with the API key header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

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
      text: async () => '{"detail":"bad image"}',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toBeNull();
  });

  it('returns null when the response is 200 but not actually an image (defensive)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '{}',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.enhance(Buffer.from('img'), 'a.jpg');

    expect(result).toBeNull();
  });

  it('returns null (never throws) when fetch itself rejects (network error)', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.enhance(Buffer.from('img'), 'a.jpg')).resolves.toBeNull();
  });
});
