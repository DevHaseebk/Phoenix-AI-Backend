import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExerciseType } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateExerciseLogDto {
  @ApiProperty({ enum: ExerciseType, example: ExerciseType.WALKING })
  @IsEnum(ExerciseType)
  exerciseType!: ExerciseType;

  @ApiProperty({ example: 30, minimum: 1, maximum: 1440 })
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes!: number;

  @ApiPropertyOptional({ example: 4000, minimum: 0, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  steps?: number;

  @ApiPropertyOptional({ example: 3.2, minimum: 0, maximum: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  distanceKm?: number;

  @ApiPropertyOptional({ example: 220, minimum: 0, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  estimatedCaloriesBurned?: number;

  @ApiPropertyOptional({ example: '2026-07-06T08:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  loggedAt?: string;

  @ApiPropertyOptional({ example: 'Morning walk' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  note?: string;
}
