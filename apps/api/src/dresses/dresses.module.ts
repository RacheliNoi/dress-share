import { Module } from '@nestjs/common';
import { DressesController } from './dresses.controller';
import { DressesService } from './dresses.service';
import { AuthModule } from '../auth/auth.module';
import { PhotoProcessingModule } from '../photo-processing/photo-processing.module';

@Module({
  imports: [AuthModule, PhotoProcessingModule],
  controllers: [DressesController],
  providers: [DressesService],
})
export class DressesModule {}
