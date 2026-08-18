import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  findMine(@CurrentUser() user: { sub: number }) {
    return this.bookingsService.findForOwner(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('dress/:dressId')
  findForDress(
    @Param('dressId') dressId: string,
    @CurrentUser() user: { sub: number },
  ) {
    return this.bookingsService.findForDress(Number(dressId), user.sub);
  }

  // Intentionally public (no JwtAuthGuard): the future public dress-details
  // screen and catalog need to show taken dates to visitors who aren't
  // signed in at all.
  @Get('dress/:dressId/availability')
  findAvailabilityForDress(@Param('dressId') dressId: string) {
    return this.bookingsService.findAvailabilityForDress(Number(dressId));
  }

  @UseGuards(JwtAuthGuard)
  @Post('interested')
  createInterested(
    @Body()
    body: {
      dressId: number;
      startDate: string;
      endDate: string;
    },
    @CurrentUser() user: { sub: number },
  ) {
    return this.bookingsService.createInterested({
      dressId: Number(body.dressId),
      startDate: body.startDate,
      endDate: body.endDate,
      ownerId: user.sub,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('rented')
  createRented(
    @Body()
    body: {
      dressId: number;
      startDate: string;
      endDate: string;
      renterId?: number;
      size?: string;
      price?: number;
    },
    @CurrentUser() user: { sub: number },
  ) {
    return this.bookingsService.createRented({
      dressId: Number(body.dressId),
      startDate: body.startDate,
      endDate: body.endDate,
      renterId: body.renterId !== undefined ? Number(body.renterId) : undefined,
      size: body.size,
      price: body.price !== undefined ? Number(body.price) : undefined,
      ownerId: user.sub,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/rent')
  markAsRented(
    @Param('id') id: string,
    @Body()
    body: {
      startDate?: string;
      endDate?: string;
      renterId?: number;
      size?: string;
      price?: number;
    },
    @CurrentUser() user: { sub: number },
  ) {
    return this.bookingsService.markAsRented(Number(id), user.sub, {
      startDate: body.startDate,
      endDate: body.endDate,
      renterId: body.renterId !== undefined ? Number(body.renterId) : undefined,
      size: body.size,
      price: body.price !== undefined ? Number(body.price) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: { sub: number }) {
    return this.bookingsService.cancelOrRemove(Number(id), user.sub);
  }
}
