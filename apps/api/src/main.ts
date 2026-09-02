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

  // Defaults to the local dev frontend so `npm run start:dev` keeps working
  // out of the box - a real deployment sets FRONTEND_URL to the actual
  // production frontend origin instead of hardcoding it here (deploy-4).
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  });

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();