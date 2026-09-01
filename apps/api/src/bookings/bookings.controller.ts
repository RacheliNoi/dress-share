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

  // "My requests/rentals" as a renter - distinct from /mine above, which is
  // bookings ON dresses this user owns.
  @UseGuards(JwtAuthGuard)
  @Get('as-renter')
  findAsRenter(@CurrentUser() user: { sub: number }) {
    return this.bookingsService.findForRenter(user.sub);
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

  // Any authenticated user (not just the dress's owner) can express
  // interest - renterId is forced from the caller's own JWT, never from the
  // request body, so it can't be spoofed to claim someone else's interest.
  @UseGuards(JwtAuthGuard)
  @Post('interested')
  createInterested(
    @Body()
    body: {
      dressId: number;
      startDate: string;
      endDate: string;
      size?: string;
    },
    @CurrentUser() user: { sub: number },
  ) {
    return this.bookingsService.createInterested({
      dressId: Number(body.dressId),
      startDate: body.startDate,
      endDate: body.endDate,
      size: body.size,
      renterId: user.sub,
    });
  }

  // TODO(auth-3): once payments (Phase 5) land, these two owner-facing
  // endpoints (this one and PATCH /:id/rent below) must stop being the way a
  // booking becomes RENTED - that will happen only via the payment
  // confirmation webhook. Kept callable for now; the behavior change itself
  // is deliberately deferred until the webhook exists to replace it.
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

  // Thread is scoped to exactly the two participants of this booking (the
  // renter and the dress's owner) - enforced in the service, not here.
  @UseGuards(JwtAuthGuard)
  @Get(':id/messages')
  getMessages(@Param('id') id: string, @CurrentUser() user: { sub: number }) {
    return this.bookingsService.getMessages(Number(id), user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/messages')
  createMessage(
    @Param('id') id: string,
    @Body() body: { body: string },
    @CurrentUser() user: { sub: number },
  ) {
    return this.bookingsService.createMessage(Number(id), user.sub, body.body);
  }

  // Owner-only "block a date" action, separate from the renter-initiated
  // booking flow above - creates a DressAvailabilityBlock, never a Booking.
  @UseGuards(JwtAuthGuard)
  @Get('dress/:dressId/blocks')
  listAvailabilityBlocks(
    @Param('dressId') dressId: string,
    @CurrentUser() user: { sub: number },
  ) {
    return this.bookingsService.listAvailabilityBlocks(Number(dressId), user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('dress/:dressId/blocks')
  createAvailabilityBlock(
    @Param('dressId') dressId: string,
    @Body() body: { startDate: string; endDate: string; reason?: string },
    @CurrentUser() user: { sub: number },
  ) {
    return this.bookingsService.createAvailabilityBlock(Number(dressId), user.sub, {
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('blocks/:id')
  deleteAvailabilityBlock(
    @Param('id') id: string,
    @CurrentUser() user: { sub: number },
  ) {
    return this.bookingsService.deleteAvailabilityBlock(Number(id), user.sub);
  }
}
