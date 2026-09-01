import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('notifyNewInterest logs the owner email and dress name', () => {
    service.notifyNewInterest(
      'owner@test.com',
      'שמלת ערב',
      new Date('2026-09-10'),
      new Date('2026-09-11'),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('owner@test.com'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('שמלת ערב'));
  });

  it('notifyNewChatMessage logs the recipient email and dress name', () => {
    service.notifyNewChatMessage('renter@test.com', 'שמלת ערב');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('renter@test.com'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('שמלת ערב'));
  });

  it('notifyInterestExpiringSoon logs the renter email and dress name', () => {
    service.notifyInterestExpiringSoon(
      'renter@test.com',
      'שמלת ערב',
      new Date('2026-09-15'),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('renter@test.com'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('שמלת ערב'));
  });

  describe('with RESEND_API_KEY configured', () => {
    const originalKey = process.env.RESEND_API_KEY;
    const originalFetch = global.fetch;

    beforeEach(() => {
      process.env.RESEND_API_KEY = 'test-resend-key';
    });

    afterEach(() => {
      process.env.RESEND_API_KEY = originalKey;
      global.fetch = originalFetch;
    });

    // `send` is called fire-and-forget (never awaited at the call sites,
    // by design - see the comment on `send` itself), so tests need to let
    // its internal promise settle before asserting on it.
    async function flush() {
      await new Promise((resolve) => setImmediate(resolve));
    }

    it('calls the real Resend API with the key and a rendered email', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });
      global.fetch = fetchMock;

      service.notifyNewInterest(
        'owner@test.com',
        'שמלת ערב',
        new Date('2026-09-10'),
        new Date('2026-09-11'),
      );
      await flush();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-resend-key',
          }),
        }),
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.to).toBe('owner@test.com');
      expect(body.subject).toContain('שמלת ערב');
    });

    it('does not fall back to the console log when Resend accepts the send', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });
      global.fetch = fetchMock;

      service.notifyNewInterest(
        'owner@test.com',
        'שמלת ערב',
        new Date('2026-09-10'),
        new Date('2026-09-11'),
      );
      await flush();

      expect(logSpy).not.toHaveBeenCalled();
    });

    it('falls back to the console log when Resend rejects the send (e.g. before a domain is verified)', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve('{"message":"please verify a domain"}'),
      });
      global.fetch = fetchMock;

      service.notifyNewChatMessage('renter@test.com', 'שמלת ערב');
      await flush();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('renter@test.com'),
      );
    });

    it('falls back to the console log when the Resend request itself fails (network error) - never throws', async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = fetchMock;

      expect(() =>
        service.notifyInterestExpiringSoon(
          'renter@test.com',
          'שמלת ערב',
          new Date('2026-09-15'),
        ),
      ).not.toThrow();
      await flush();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('renter@test.com'),
      );
    });
  });
});
