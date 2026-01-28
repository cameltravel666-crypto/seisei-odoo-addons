import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global prefix for all routes
  app.setGlobalPrefix('v1');

  // Enable CORS for QR ordering clients
  app.enableCors({
    origin: [
      'https://demo.nagashiro.top',
      'https://testodoo.seisei.tokyo',
      /\.erp\.seisei\.tokyo$/,
      /localhost/,
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Order-Id'],
  });

  const port = process.env.PORT || 3100;
  await app.listen(port);
  logger.log(`QR-BFF service running on port ${port}`);
}
bootstrap();
