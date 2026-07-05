import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Haseeb' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ example: '+923001234567', nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(trimString)
  @IsString()
  @MaxLength(30)
  phone?: string | null;
}
