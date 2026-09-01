import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import type { CatalogSortOption } from './dresses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// Query params always arrive as strings (or are absent/omitted) - never
// trusted as-is for a field that's an Int column in Postgres
// (DressSize.price), since passing a non-integer to Prisma's gte/lte for an
// Int field throws a validation error rather than just miscomparing. An
// unparseable value is treated as "not provided" rather than failing the
// whole public catalog request over one malformed query param.
function parseOptionalIntQueryParam(value?: string): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : undefined;
}

@Controller('dresses')
export class DressesController {
  constructor(private readonly dressesService: DressesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: { sub: number }) {
    return this.dressesService.findByOwner(user.sub);
  }

  // Public, unauthenticated - unchanged. All params are optional; with none
  // supplied this calls findApproved() with every field undefined, which
  // produces byte-for-byte the same query as before this endpoint accepted
  // any query params at all.
  @Get('approved')
  findApproved(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('color') color?: string,
    @Query('size') size?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('sort') sort?: CatalogSortOption,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dressesService.findApproved({
      search,
      category,
      color,
      size,
      priceMin: parseOptionalIntQueryParam(priceMin),
      priceMax: parseOptionalIntQueryParam(priceMax),
      sort,
      page: parseOptionalIntQueryParam(page),
      limit: parseOptionalIntQueryParam(limit),
    });
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
    quantity?: number;
  },
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.addSize({
    dressId: Number(id),
    size: body.size,
    price: Number(body.price),
    quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
    ownerId: user.sub,
  });
}

@UseGuards(JwtAuthGuard)
@Patch(':id/sizes/:sizeId')
updateSize(
  @Param('id') id: string,
  @Param('sizeId') sizeId: string,
  @Body()
  body: {
    size?: string;
    price?: number;
    quantity?: number;
  },
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.updateSize(
    Number(id),
    Number(sizeId),
    user.sub,
    {
      size: body.size,
      price: body.price !== undefined ? Number(body.price) : undefined,
      quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
    },
  );
}

@UseGuards(JwtAuthGuard)
@Delete(':id/sizes/:sizeId')
removeSize(
  @Param('id') id: string,
  @Param('sizeId') sizeId: string,
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.removeSize(
    Number(id),
    Number(sizeId),
    user.sub,
  );
}

@UseGuards(JwtAuthGuard)
@Post(':id/sizes/:sizeId/cancel-pending')
cancelPendingSizeChange(
  @Param('id') id: string,
  @Param('sizeId') sizeId: string,
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.cancelPendingSizeChange(
    Number(id),
    Number(sizeId),
    user.sub,
  );
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
@Post(':id/photos/:photoId/cancel-pending')
cancelPendingPhotoChange(
  @Param('id') id: string,
  @Param('photoId') photoId: string,
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.cancelPendingPhotoChange(
    Number(id),
    Number(photoId),
    user.sub,
  );
}

@UseGuards(JwtAuthGuard)
@Post(':id/photos/:photoId/reprocess')
reprocessPhoto(
  @Param('id') id: string,
  @Param('photoId') photoId: string,
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.reprocessPhoto(
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
@Post(':id/submit-edit')
submitEditForApproval(
  @Param('id') id: string,
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.submitEditForApproval(
    Number(id),
    user.sub,
  );
}

@UseGuards(JwtAuthGuard)
@Post(':id/cancel-edit')
cancelPendingEdit(
  @Param('id') id: string,
  @CurrentUser() user: { sub: number },
) {
  return this.dressesService.cancelPendingEdit(
    Number(id),
    user.sub,
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