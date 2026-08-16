import { Module } from '@nestjs/common';
import { DressesController } from './dresses.controller';
import { DressesService } from './dresses.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DressesController],
  providers: [DressesService],
})
export class DressesModule {}
