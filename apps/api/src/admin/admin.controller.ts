import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dresses/pending')
  findPendingDresses() {
    return this.adminService.findPendingDresses();
  }

  @Post('dresses/:id/approve')
  approveDress(@Param('id') id: string) {
    return this.adminService.approveDress(Number(id));
  }

  @Post('dresses/:id/reject')
  rejectDress(@Param('id') id: string) {
    return this.adminService.rejectDress(Number(id));
  }
}