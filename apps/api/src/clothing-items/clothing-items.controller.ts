import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClothingItemsService } from './clothing-items.service';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('clothing-items')
export class ClothingItemsController {
  constructor(
    private readonly clothingItemsService: ClothingItemsService,
  ) {}

  @Get()
  findAll(@Query('userId') userId?: string) {
    if (userId) {
      return this.clothingItemsService.findByUser(Number(userId));
    }

    return this.clothingItemsService.findAll();
  }

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
      userId: number;
    },
    ) {
    return this.clothingItemsService.create({
    ...body,
    userId: Number(body.userId),
    imageUrl: file ? `/uploads/${file.filename}` : undefined,
    });
    }

  @Delete(':id')
    remove(@Param('id') id: string) {
    return this.clothingItemsService.remove(Number(id));
  }
}