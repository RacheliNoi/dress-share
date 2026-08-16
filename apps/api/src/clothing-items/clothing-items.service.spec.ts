import { Test, TestingModule } from '@nestjs/testing';
import { ClothingItemsService } from './clothing-items.service';

describe('ClothingItemsService', () => {
  let service: ClothingItemsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClothingItemsService],
    }).compile();

    service = module.get<ClothingItemsService>(ClothingItemsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
