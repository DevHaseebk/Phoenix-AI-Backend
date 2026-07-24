import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Both fields optional (at least one required, enforced in the controller) -
 * a title-only edit never re-triggers re-chunking/re-embedding, only a
 * content change does. See AdminRagService.update(). */
export class UpdateAdminRagDocumentDto {
  @ApiPropertyOptional({ example: 'Walking as a Weight-Loss Tool' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Walking is one of the most...' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content?: string;
}
