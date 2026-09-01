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
});
