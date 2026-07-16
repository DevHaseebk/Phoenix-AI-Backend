import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PrismaModule, JwtModule.register({}), MailModule],
  controllers: [AuthController, SessionsController, AdminController],
  providers: [
    AuthService,
    JwtAuthGuard,
    AdminGuard,
    SessionsService,
    PasswordResetService,
    EmailVerificationService,
  ],
  exports: [JwtAuthGuard, AdminGuard, JwtModule],
})
export class AuthModule {}
