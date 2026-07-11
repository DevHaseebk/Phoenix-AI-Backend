import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FoodCategory } from '@prisma/client';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ApproveUnknownFoodDto {
  @ApiProperty({ example: 'Chicken Karahi' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: FoodCategory, example: FoodCategory.MAIN_DISH })
  @IsEnum(FoodCategory)
  category!: FoodCategory;

  @ApiProperty({ example: 220, minimum: 0, maximum: 900 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(900)
  caloriesPer100g!: number;

  @ApiProperty({ example: 18, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  proteinPer100g!: number;

  @ApiPropertyOptional({ example: 5, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  carbsPer100g?: number;

  @ApiPropertyOptional({ example: 12, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  fatPer100g?: number;

  @ApiProperty({ example: '1 medium plate' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  defaultServingDescription!: string;

  @ApiProperty({ example: 300, minimum: 1, maximum: 3000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(3000)
  defaultServingGrams!: number;

  @ApiPropertyOptional({ type: [String], example: ['murgh karahi'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  aliases?: string[];
}
