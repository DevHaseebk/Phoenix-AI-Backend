import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';

function parseAllowedOrigins(
  corsOrigins: string | undefined,
  nodeEnv: string,
): string[] {
  if (corsOrigins) {
    return corsOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  if (nodeEnv === 'development' || nodeEnv === 'test') {
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4000',
    ];
  }

  return [];
}

async function bootstrap() {
  // rawBody: true exposes req.rawBody (populated only for the routes that
  // need it) - required to verify the Stripe webhook signature
  // (billing.controller.ts) against the exact bytes Stripe signed, since
  // Nest's default body-parser only keeps the parsed JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const nodeEnv = config.getOrThrow<string>('NODE_ENV');
  const port = config.getOrThrow<number>('PORT');
  const allowedOrigins = parseAllowedOrigins(
    config.get<string>('CORS_ORIGINS'),
    nodeEnv,
  );

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  if (nodeEnv === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Project Phoenix API')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
}

void bootstrap();
