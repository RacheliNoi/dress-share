import { StorageService } from './storage.service';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('StorageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      R2_ACCOUNT_ID: 'account-id',
      R2_ACCESS_KEY_ID: 'key-id',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET_NAME: 'dressshare-photos',
      R2_PUBLIC_URL: 'https://cdn.dressshare.co.il',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isManagedUrl', () => {
    it('is true for a URL under the configured public URL', () => {
      const service = new StorageService();
      expect(service.isManagedUrl('https://cdn.dressshare.co.il/dresses/1/a.jpg')).toBe(true);
    });

    it('is false for a local /uploads URL', () => {
      const service = new StorageService();
      expect(service.isManagedUrl('/uploads/a.jpg')).toBe(false);
    });

    it('is false when R2_PUBLIC_URL is not configured', () => {
      process.env.R2_PUBLIC_URL = '';
      const service = new StorageService();
      expect(service.isManagedUrl('/uploads/a.jpg')).toBe(false);
    });
  });

  describe('upload', () => {
    it('returns the public URL on success', async () => {
      sendMock.mockResolvedValue({});
      const service = new StorageService();

      const url = await service.upload(Buffer.from('bytes'), 'dresses/1/a.jpg', 'image/jpeg');

      expect(url).toBe('https://cdn.dressshare.co.il/dresses/1/a.jpg');
      expect(sendMock).toHaveBeenCalled();
    });

    it('returns null (never throws) when the underlying request fails - e.g. this sandbox\'s network filter blocking r2.cloudflarestorage.com', async () => {
      sendMock.mockRejectedValue(new Error('network error'));
      const service = new StorageService();

      const url = await service.upload(Buffer.from('bytes'), 'dresses/1/a.jpg', 'image/jpeg');

      expect(url).toBeNull();
    });

    it('returns null without attempting a request when R2 is not configured', async () => {
      process.env.R2_BUCKET_NAME = '';
      const service = new StorageService();

      const url = await service.upload(Buffer.from('bytes'), 'dresses/1/a.jpg', 'image/jpeg');

      expect(url).toBeNull();
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('returns the object bytes on success', async () => {
      sendMock.mockResolvedValue({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      });
      const service = new StorageService();

      const result = await service.download('https://cdn.dressshare.co.il/dresses/1/a.jpg');

      expect(result).toEqual(Buffer.from([1, 2, 3]));
    });

    it('returns null (never throws) on failure', async () => {
      sendMock.mockRejectedValue(new Error('not found'));
      const service = new StorageService();

      const result = await service.download('https://cdn.dressshare.co.il/dresses/1/a.jpg');

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('sends a delete request for the object key', async () => {
      sendMock.mockResolvedValue({});
      const service = new StorageService();

      await service.delete('https://cdn.dressshare.co.il/dresses/1/a.jpg');

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ Key: 'dresses/1/a.jpg' }),
        }),
      );
    });

    it('swallows errors instead of throwing - the DB record is already gone regardless', async () => {
      sendMock.mockRejectedValue(new Error('already gone'));
      const service = new StorageService();

      await expect(
        service.delete('https://cdn.dressshare.co.il/dresses/1/a.jpg'),
      ).resolves.toBeUndefined();
    });
  });
});
