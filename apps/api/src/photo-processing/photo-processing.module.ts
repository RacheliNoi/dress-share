import { Module } from '@nestjs/common';
import { PhotoProcessingService } from './photo-processing.service';

@Module({
  providers: [PhotoProcessingService],
  exports: [PhotoProcessingService],
})
export class PhotoProcessingModule {}
