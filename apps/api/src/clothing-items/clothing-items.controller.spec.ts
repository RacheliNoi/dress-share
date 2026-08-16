import { Test, TestingModule } from '@nestjs/testing';
import { ClothingItemsController } from './clothing-items.controller';

describe('ClothingItemsController', () => {
  let controller: ClothingItemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClothingItemsController],
    }).compile();

    controller = module.get<ClothingItemsController>(ClothingItemsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
