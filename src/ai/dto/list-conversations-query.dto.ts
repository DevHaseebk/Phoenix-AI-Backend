import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

function toOptionalNumber({ value }: TransformFnParams): number | undefined {
  return value === undefined ? undefined : Number(value);
}

export class ListConversationsQueryDto {
  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
