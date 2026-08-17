import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { DressesService } from './dresses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('dresses')
export class DressesController {
  constructor(private readonly dressesService: DressesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: { sub: number }) {
    return this.dressesService.findByOwner(user.sub);
  }

  @Get('approved')
  findApproved() {
    return this.dressesService.findApproved();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      category?: string;
      color?: string;
    },
    @CurrentUser() user: { sub: number },
  ) {
    return this.dressesService.create({
      ...body,
      ownerId: user.sub,
    });
  }

  @UseGuards(JwtAuthGuard)
@Post(':id/sizes')
addSize(
  @Param('id') id: string,
  @Body()
  body: {
    size: string;
    price: number;
  },
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.addSize({
    dressId: Number(id),
    size: body.size,
    price: Number(body.price),
    ownerId: user.sub,
  });
}

@UseGuards(JwtAuthGuard)
@Post(':id/photos')
@UseInterceptors(
  FilesInterceptor('images', 10, {
    storage: diskStorage({
      destination: './uploads',
      filename: (_req, file, callback) => {
        const uniqueName = `${Date.now()}-${Math.round(
          Math.random() * 1e9,
        )}${extname(file.originalname)}`;

        callback(null, uniqueName);
      },
    }),
  }),
)
addPhotos(
  @Param('id') id: string,
  @UploadedFiles() files: Express.Multer.File[],
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.addPhotos(
    Number(id),
    user.sub,
    files,
  );
}

@UseGuards(JwtAuthGuard)
@Delete(':id/photos/:photoId')
removePhoto(
  @Param('id') id: string,
  @Param('photoId') photoId: string,
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.removePhoto(
    Number(id),
    Number(photoId),
    user.sub,
  );
}

@UseGuards(JwtAuthGuard)
@Post(':id/submit')
submitForApproval(
  @Param('id') id: string,
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.submitForApproval(
    Number(id),
    user.sub,
  );
}

@UseGuards(JwtAuthGuard)
@Post(':id/update')
update(
  @Param('id') id: string,
  @Body()
  body: {
    name?: string;
    description?: string;
    category?: string;
    color?: string;
  },
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.update(
    Number(id),
    user.sub,
    body,
  );
}

@UseGuards(JwtAuthGuard)
@Delete(':id')
remove(
  @Param('id') id: string,
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.remove(Number(id), user.sub);
}
}