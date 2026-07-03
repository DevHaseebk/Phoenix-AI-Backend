import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';

export interface SignupUserResponse {
  id: string;
  fullName: string | null;
  email: string | null;
  status: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(signupDto: SignupDto): Promise<{ user: SignupUserResponse }> {
    const email = signupDto.email.trim().toLowerCase();
    const fullName = signupDto.fullName.trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Account already exists');
    }

    const passwordHash = await argon2.hash(signupDto.password, {
      type: argon2.argon2id,
    });

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          fullName,
          passwordHash,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
        },
      });

      return { user };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Account already exists');
      }

      throw error;
    }
  }
}
