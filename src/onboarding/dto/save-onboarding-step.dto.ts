import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength } from 'class-validator';

export class SaveOnboardingStepDto {
  @ApiProperty({ example: 'BASIC_INFO' })
  @IsString()
  @MaxLength(50)
  step!: string;

  @ApiProperty({
    example: {
      gender: 'MALE',
      heightCm: 188,
      currentWeightKg: 150,
      targetWeightKg: 100,
    },
  })
  @IsObject()
  data!: Record<string, unknown>;
}
