import { ApiPropertyOptional } from '@nestjs/swagger';
import { MealType } from '@prisma/client';
import { Type, Transform, TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateMealLogItemDto } from './create-meal-log.dto';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateMealLogDto {
  @ApiPropertyOptional({ enum: MealType, example: MealType.LUNCH })
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;

  @ApiPropertyOptional({ example: '2026-07-06T12:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  loggedAt?: string;

  @ApiPropertyOptional({ example: 'Chicken biryani', maxLength: 200 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ example: 'Home cooked', maxLength: 500 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    type: [CreateMealLogItemDto],
    minItems: 1,
    maxItems: 20,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateMealLogItemDto)
  items?: CreateMealLogItemDto[];
}
