import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  // The uploads directory is gitignored and not created by anything else;
  // ensure it exists before Multer or ServeStaticModule try to use it.
  mkdirSync(join(process.cwd(), 'uploads'), { recursive: true });

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: 'http://localhost:3000',
  });

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();