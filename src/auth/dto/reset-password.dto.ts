import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'a-short-lived-single-use-token' })
  @IsString()
  @MaxLength(512)
  resetToken!: string;

  @ApiProperty({ example: 'NewStrongPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
