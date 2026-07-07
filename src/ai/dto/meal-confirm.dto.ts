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
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class MealConfirmItemDto {
  @ApiProperty({ example: 'Chicken Biryani', minLength: 1, maxLength: 150 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: 'medium plate', maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  quantityText?: string;

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

  @ApiProperty({ example: 85, minimum: 0, maximum: 1000 })
  @IsNumber()
  @Min(0)
  @Max(1000)
  carbsGrams!: number;

  @ApiProperty({ example: 28, minimum: 0, maximum: 500 })
  @IsNumber()
  @Min(0)
  @Max(500)
  fatGrams!: number;

  @ApiPropertyOptional({ example: 4, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  fiberGrams?: number;
}

export class MealConfirmCorrectionsDto {
  @ApiPropertyOptional({ enum: MealType, example: MealType.LUNCH })
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;

  @ApiPropertyOptional({ example: '2026-07-07T12:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  loggedAt?: string;

  @ApiPropertyOptional({
    type: [MealConfirmItemDto],
    minItems: 1,
    maxItems: 20,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MealConfirmItemDto)
  items?: MealConfirmItemDto[];
}

export class MealConfirmDto {
  @ApiProperty({ example: '2f8f1d41-7b0b-4c2d-88b0-0dfef518a708' })
  @IsUUID()
  estimateId!: string;

  @ApiPropertyOptional({ type: MealConfirmCorrectionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MealConfirmCorrectionsDto)
  corrections?: MealConfirmCorrectionsDto;
}
