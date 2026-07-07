import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ChatDto {
  @ApiPropertyOptional({ example: '2f8f1d41-7b0b-4c2d-88b0-0dfef518a708' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({ example: 'What should I focus on for dinner today?' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}
