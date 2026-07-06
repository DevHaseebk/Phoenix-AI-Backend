import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateWaterLogDto {
  @ApiProperty({ example: 500, minimum: 1, maximum: 5000 })
  @IsInt()
  @Min(1)
  @Max(5000)
  amountMl!: number;

  @ApiPropertyOptional({ example: '2026-07-06T08:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  loggedAt?: string;

  @ApiPropertyOptional({ example: 'Morning water' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  note?: string;
}
