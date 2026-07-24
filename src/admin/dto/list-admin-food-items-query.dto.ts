import { ApiPropertyOptional } from '@nestjs/swagger';
import { FoodSource } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

function toBoolean({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
}

export class ListAdminFoodItemsQueryDto {
  @ApiPropertyOptional({
    enum: FoodSource,
    description: 'Defaults to AI_ESTIMATE (the review queue) when omitted',
  })
  @IsOptional()
  @IsEnum(FoodSource)
  source?: FoodSource;

  @ApiPropertyOptional({
    description: 'Defaults to false (the review queue) when omitted',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional({ description: 'Case-insensitive match on name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
