import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateGroceryItemDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  checked!: boolean;
}
