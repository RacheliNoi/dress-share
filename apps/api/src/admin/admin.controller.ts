import {
  Controller,
  Get,
  Param,
  Patch,
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

  @Patch('dresses/:id/approve')
  approveDress(@Param('id') id: string) {
    return this.adminService.approveDress(Number(id));
  }

  @Patch('dresses/:id/reject')
  rejectDress(@Param('id') id: string) {
    return this.adminService.rejectDress(Number(id));
  }
}