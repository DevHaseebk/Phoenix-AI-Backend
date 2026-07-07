import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealType } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class MealEstimateDto {
  @ApiPropertyOptional({ example: '2f8f1d41-7b0b-4c2d-88b0-0dfef518a708' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({ example: 'One plate chicken biryani with raita' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({ enum: MealType, example: MealType.LUNCH })
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;

  @ApiPropertyOptional({ example: '2026-07-07T12:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
