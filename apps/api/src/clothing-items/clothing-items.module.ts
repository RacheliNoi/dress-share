import { Module } from '@nestjs/common';
import { ClothingItemsController } from './clothing-items.controller';
import { ClothingItemsService } from './clothing-items.service';

@Module({
  controllers: [ClothingItemsController],
  providers: [ClothingItemsService]
})
export class ClothingItemsModule {}
