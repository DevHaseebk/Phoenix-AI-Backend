import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RequestWithUser } from '../types/authenticated-user.interface';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Runs JwtAuthGuard's full token/user verification first, then requires
 * role: ADMIN on top - never a standalone check, so an admin route is never
 * accidentally reachable by a valid-but-non-admin token.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwtAuthGuard: JwtAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.jwtAuthGuard.canActivate(context);

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (request.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
