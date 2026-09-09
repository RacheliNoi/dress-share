import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('ids')
  listIds(@CurrentUser() user: { sub: number }) {
    return this.favoritesService.listDressIds(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':dressId')
  add(
    @Param('dressId', ParseIntPipe) dressId: number,
    @CurrentUser() user: { sub: number },
  ) {
    return this.favoritesService.add(user.sub, dressId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':dressId')
  remove(
    @Param('dressId', ParseIntPipe) dressId: number,
    @CurrentUser() user: { sub: number },
  ) {
    return this.favoritesService.remove(user.sub, dressId);
  }
}
