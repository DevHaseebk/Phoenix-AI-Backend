import { ApiPropertyOptional } from '@nestjs/swagger';
import { UnknownFoodQueueStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListUnknownFoodsQueryDto {
  @ApiPropertyOptional({ enum: UnknownFoodQueueStatus })
  @IsOptional()
  @IsEnum(UnknownFoodQueueStatus)
  status?: UnknownFoodQueueStatus;
}
