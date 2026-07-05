import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { successResponse } from '../common/responses/response.helper';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Logged in successfully' })
  async login(@Body() loginDto: LoginDto, @Req() request: Request) {
    const data = await this.authService.login(loginDto, {
      userAgent: request.get('user-agent'),
      ipAddress: request.ip,
    });

    return successResponse(data, 'Logged in successfully', {});
  }
}
