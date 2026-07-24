import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class RunGoldenTestsDto {
  @ApiProperty({
    description:
      'Must be explicitly true - this run spends real Gemini API quota (~21 calls).',
  })
  @IsBoolean()
  confirm!: boolean;
}
