import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum DashboardSummaryRange {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
}

export class DashboardSummaryQueryDto {
  @ApiPropertyOptional({
    enum: DashboardSummaryRange,
    default: DashboardSummaryRange.SEVEN_DAYS,
  })
  @IsOptional()
  @IsEnum(DashboardSummaryRange)
  range?: DashboardSummaryRange = DashboardSummaryRange.SEVEN_DAYS;
}
