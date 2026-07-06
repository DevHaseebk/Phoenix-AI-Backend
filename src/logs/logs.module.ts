import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WeightLogsController } from './weight-logs.controller';
import { WeightLogsService } from './weight-logs.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [WeightLogsController],
  providers: [WeightLogsService],
})
export class LogsModule {}
