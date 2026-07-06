import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExerciseLogsController } from './exercise-logs.controller';
import { ExerciseLogsService } from './exercise-logs.service';
import { MealLogsController } from './meal-logs.controller';
import { MealLogsService } from './meal-logs.service';
import { WeightLogsController } from './weight-logs.controller';
import { WeightLogsService } from './weight-logs.service';
import { WaterLogsController } from './water-logs.controller';
import { WaterLogsService } from './water-logs.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [
    WeightLogsController,
    WaterLogsController,
    ExerciseLogsController,
    MealLogsController,
  ],
  providers: [
    WeightLogsService,
    WaterLogsService,
    ExerciseLogsService,
    MealLogsService,
  ],
})
export class LogsModule {}
