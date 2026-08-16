import { Module } from '@nestjs/common';
import { ClothingItemsController } from './clothing-items.controller';
import { ClothingItemsService } from './clothing-items.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ClothingItemsController],
  providers: [ClothingItemsService]
})
export class ClothingItemsModule {}
