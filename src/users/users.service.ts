import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface CurrentUserProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastActiveAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUser(userId: string): Promise<CurrentUserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.toCurrentUserProfile(user);
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<CurrentUserProfile> {
    if (
      updateProfileDto.fullName === undefined &&
      updateProfileDto.phone === undefined
    ) {
      throw new BadRequestException('At least one profile field is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(updateProfileDto.fullName === undefined
            ? {}
            : { fullName: updateProfileDto.fullName }),
          ...(updateProfileDto.phone === undefined
            ? {}
            : { phone: updateProfileDto.phone }),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          status: true,
          emailVerifiedAt: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return this.toCurrentUserProfile(updatedUser);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Phone number already in use');
      }

      throw error;
    }
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
      },
    });

    if (
      !user ||
      !user.passwordHash ||
      user.status !== UserStatus.ACTIVE ||
      user.deletedAt !== null
    ) {
      throw new UnauthorizedException('Unauthorized');
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      changePasswordDto.currentPassword,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid current password');
    }

    const passwordHash = await argon2.hash(changePasswordDto.newPassword, {
      type: argon2.argon2id,
    });
    const revokedAt = new Date();

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: { id: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt },
    });

    return null;
  }

  private toCurrentUserProfile(user: CurrentUserProfile): CurrentUserProfile {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
