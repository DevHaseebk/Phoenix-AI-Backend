import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController, SessionsController],
  providers: [AuthService, JwtAuthGuard, SessionsService],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
