import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class GenerateWeeklyReviewDto {
  @ApiPropertyOptional({
    example: '2026-06-25',
    description:
      'Local date (YYYY-MM-DD) inside the target week. Defaults to the most recently completed week when omitted.',
  })
  @IsOptional()
  @IsDateString()
  weekStart?: string;
}
