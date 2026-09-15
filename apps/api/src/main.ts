import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  // The uploads directory is gitignored and not created by anything else;
  // ensure it exists before Multer or ServeStaticModule try to use it.
  mkdirSync(join(process.cwd(), 'uploads'), { recursive: true });

  const app = await NestFactory.create(AppModule);

  // Baseline security headers (X-Content-Type-Options, a default CSP,
  // X-Frame-Options, etc.) for cheap defense-in-depth - crossOriginResourcePolicy
  // is relaxed to "cross-origin" since /uploads is meant to be fetched by
  // the separately-hosted frontend origin, which the default "same-origin"
  // policy would otherwise block.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Defaults to the local dev frontend so `npm run start:dev` keeps working
  // out of the box - a real deployment sets FRONTEND_URL to the actual
  // production frontend origin instead of hardcoding it here (deploy-4).
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  });

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();