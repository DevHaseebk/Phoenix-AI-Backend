import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealType } from '@prisma/client';
import { Type, Transform, TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateMealLogItemDto {
  @ApiProperty({ example: 'Chicken Biryani', minLength: 1, maxLength: 150 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  foodName!: string;

  @ApiPropertyOptional({ example: 'medium plate', maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  portionLabel?: string;

  @ApiPropertyOptional({ example: 1, minimum: 0.01, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100)
  quantity?: number;

  @ApiProperty({ example: 750, minimum: 0, maximum: 10000 })
  @IsNumber()
  @Min(0)
  @Max(10000)
  calories!: number;

  @ApiProperty({ example: 35, minimum: 0, maximum: 500 })
  @IsNumber()
  @Min(0)
  @Max(500)
  proteinGrams!: number;

  @ApiPropertyOptional({ example: 85, minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  carbsGrams?: number;

  @ApiPropertyOptional({ example: 28, minimum: 0, maximum: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  fatGrams?: number;
}

export class CreateMealLogDto {
  @ApiProperty({ enum: MealType, example: MealType.LUNCH })
  @IsEnum(MealType)
  mealType!: MealType;

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

  @ApiProperty({ type: [CreateMealLogItemDto], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateMealLogItemDto)
  items!: CreateMealLogItemDto[];
}
