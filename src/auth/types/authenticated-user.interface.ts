import { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  fullName: string | null;
  status: UserStatus;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

export interface AccessTokenPayload {
  sub?: unknown;
  email?: unknown;
  status?: unknown;
}
