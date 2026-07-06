import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityLevel, Gender, GoalPace, GoalType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CompleteOnboardingDto {
  @ApiProperty({ enum: Gender, example: Gender.MALE })
  @IsEnum(Gender)
  gender!: Gender;

  @ApiProperty({ example: '1998-01-01' })
  @Type(() => Date)
  @IsDate()
  dateOfBirth!: Date;

  @ApiProperty({ example: 188 })
  @Type(() => Number)
  @Min(100)
  @Max(250)
  heightCm!: number;

  @ApiProperty({ example: 150 })
  @Type(() => Number)
  @Min(30)
  @Max(350)
  currentWeightKg!: number;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @Min(30)
  @Max(350)
  targetWeightKg!: number;

  @ApiProperty({ enum: GoalType, example: GoalType.LOSE_WEIGHT })
  @IsEnum(GoalType)
  goalType!: GoalType;

  @ApiProperty({ enum: GoalPace, example: GoalPace.BALANCED })
  @IsEnum(GoalPace)
  goalPace!: GoalPace;

  @ApiProperty({
    enum: ActivityLevel,
    example: ActivityLevel.SEDENTARY,
  })
  @IsEnum(ActivityLevel)
  activityLevel!: ActivityLevel;

  @ApiPropertyOptional({ example: 'Asia/Karachi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredLanguage?: string;

  @ApiPropertyOptional({ example: ['CHICKEN', 'BEEF'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  foodPreferences?: string[];

  @ApiPropertyOptional({ example: ['OATS'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  foodDislikes?: string[];

  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true)
  commitmentAccepted!: true;
}
