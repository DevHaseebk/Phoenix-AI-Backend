import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateMemoryDto {
  @ApiProperty({ example: 'Prefers walking in the evening, not mornings.' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;
}
