import { Module } from '@nestjs/common';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { TokenService } from './token.service';

@Module({
  controllers: [QrController],
  providers: [QrService, TokenService],
})
export class QrModule {}
