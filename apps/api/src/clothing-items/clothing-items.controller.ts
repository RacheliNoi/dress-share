import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClothingItemsService } from './clothing-items.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('clothing-items')
export class ClothingItemsController {
  constructor(
    private readonly clothingItemsService: ClothingItemsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: { sub: number }) {
    return this.clothingItemsService.findByUser(user.sub);
  }

   @UseGuards(JwtAuthGuard)
   @Post()
   @UseInterceptors(
    FileInterceptor('image', {
        storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, callback) => {
            const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
            callback(null, uniqueName);
        },
        }),
    }),
    )
   create(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      name: string;
      category: string;
      size?: string;
      color?: string;
      imageUrl?: string;
    },
    @CurrentUser() user: { sub: number },
    ) {
    return this.clothingItemsService.create({
    ...body,
    userId: user.sub,
    imageUrl: file ? `/uploads/${file.filename}` : undefined,
    });
    }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
    remove(
      @Param('id') id: string,
      @CurrentUser() user: { sub: number },
    ) {
    return this.clothingItemsService.remove(Number(id), user.sub);
  }
}