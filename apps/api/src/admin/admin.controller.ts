import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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

  @Patch('dresses/:id/approve')
  approveDress(@Param('id') id: string) {
    return this.adminService.approveDress(Number(id));
  }

  @Patch('dresses/:id/reject')
  rejectDress(
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.adminService.rejectDress(Number(id), body?.reason);
  }

  @Post('users/:id/reset-password')
  initiatePasswordReset(@Param('id') id: string) {
    return this.adminService.initiatePasswordReset(Number(id));
  }
}