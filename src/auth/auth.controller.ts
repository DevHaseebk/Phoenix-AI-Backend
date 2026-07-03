import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../common/responses/response.helper';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiCreatedResponse({ description: 'Account created successfully' })
  async signup(@Body() signupDto: SignupDto) {
    const data = await this.authService.signup(signupDto);

    return successResponse(data, 'Account created successfully', {});
  }
}
