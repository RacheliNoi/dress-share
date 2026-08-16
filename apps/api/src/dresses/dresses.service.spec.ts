import { Test, TestingModule } from '@nestjs/testing';
import { DressesService } from './dresses.service';

describe('DressesService', () => {
  let service: DressesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DressesService],
    }).compile();

    service = module.get<DressesService>(DressesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
