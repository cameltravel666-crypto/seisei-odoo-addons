import { Module, Global } from '@nestjs/common';
import { OdooClient } from './odoo.client';
import { PosService } from './pos.service';

@Global()
@Module({
  providers: [OdooClient, PosService],
  exports: [OdooClient, PosService],
})
export class OdooModule {}
