import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessTokenPayload,
  AuthenticatedUser,
  RequestWithUser,
} from '../types/authenticated-user.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw this.unauthorized();
    }

    const payload = await this.verifyToken(token);
    const payloadUser = this.mapPayload(payload);

    const user = await this.prisma.user.findUnique({
      where: { id: payloadUser.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        role: true,
        deletedAt: true,
      },
    });

    if (
      !user ||
      !user.email ||
      user.email !== payloadUser.email ||
      user.status !== UserStatus.ACTIVE ||
      user.deletedAt !== null
    ) {
      throw this.unauthorized();
    }

    request.user = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      role: user.role,
    };

    return true;
  }

  private extractBearerToken(authorization: unknown): string | undefined {
    if (typeof authorization !== 'string') {
      return undefined;
    }

    const [scheme, token, extra] = authorization.trim().split(/\s+/);

    if (scheme !== 'Bearer' || !token || extra) {
      return undefined;
    }

    return token;
  }

  private async verifyToken(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw this.unauthorized();
    }
  }

  private mapPayload(
    payload: AccessTokenPayload,
  ): Pick<AuthenticatedUser, 'userId' | 'email' | 'status'> {
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      payload.status !== UserStatus.ACTIVE
    ) {
      throw this.unauthorized();
    }

    return {
      userId: payload.sub,
      email: payload.email,
      status: payload.status,
    };
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException('Unauthorized');
  }
}
