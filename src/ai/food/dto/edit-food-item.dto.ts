import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/** All fields optional (at least one required, enforced in the controller) -
 * this is a partial edit of an already-approved FoodItem's nutrition
 * values, not a full re-approval. */
export class EditFoodItemDto {
  @ApiPropertyOptional({ example: 220, minimum: 0, maximum: 900 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(900)
  caloriesPer100g?: number;

  @ApiPropertyOptional({ example: 18, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  proteinPer100g?: number;

  @ApiPropertyOptional({ example: 5, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  carbsPer100g?: number;

  @ApiPropertyOptional({ example: 12, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  fatPer100g?: number;

  @ApiPropertyOptional({ example: 300, minimum: 1, maximum: 3000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(3000)
  defaultServingGrams?: number;
}
