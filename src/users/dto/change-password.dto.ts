import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

function IsDifferentFrom(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isDifferentFrom',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[
            relatedPropertyName
          ];

          return value !== relatedValue;
        },
      },
    });
  };
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentPassword123' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: 'NewStrongPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @IsDifferentFrom('currentPassword', {
    message: 'newPassword must be different from currentPassword',
  })
  newPassword!: string;
}
