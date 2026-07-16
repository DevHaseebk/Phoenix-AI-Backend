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
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

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

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Logged in successfully' })
  async google(@Body() googleAuthDto: GoogleAuthDto, @Req() request: Request) {
    const data = await this.authService.loginWithGoogle(googleAuthDto, {
      userAgent: request.get('user-agent'),
      ipAddress: request.ip,
    });

    return successResponse(data, 'Logged in successfully', {});
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Token refreshed successfully' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const data = await this.authService.refreshAccessToken(
      refreshTokenDto.refreshToken,
    );

    return successResponse(data, 'Token refreshed successfully', {});
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Logged out successfully' })
  async logout(@Body() refreshTokenDto: RefreshTokenDto) {
    await this.authService.logout(refreshTokenDto.refreshToken);

    return successResponse(null, 'Logged out successfully', {});
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'If that account exists, a reset code has been sent',
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.passwordResetService.forgotPassword(forgotPasswordDto.email);

    // Always the same message regardless of whether the account exists,
    // has a password, or is rate-limited - never an enumeration oracle.
    return successResponse(
      null,
      'If an account with that email exists, a password reset code has been sent.',
      {},
    );
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Password reset successfully' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    await this.passwordResetService.resetPassword(
      resetPasswordDto.email,
      resetPasswordDto.otp,
      resetPasswordDto.newPassword,
    );

    return successResponse(null, 'Password reset successfully', {});
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Email verified successfully' })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    await this.emailVerificationService.verifyEmail(
      verifyEmailDto.email,
      verifyEmailDto.otp,
    );

    return successResponse(null, 'Email verified successfully', {});
  }
}
