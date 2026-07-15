import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAccessOverrideDto {
  @ApiProperty()
  @IsBoolean()
  accessOverride: boolean;
}
