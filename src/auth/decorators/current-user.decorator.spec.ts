import { ExecutionContext } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../types/authenticated-user.interface';
import { currentUserFactory } from './current-user.decorator';

describe('currentUserFactory', () => {
  it('extracts authenticated user context from the request', () => {
    const user: AuthenticatedUser = {
      userId: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.ACTIVE,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as ExecutionContext;

    expect(currentUserFactory(context)).toEqual(user);
  });
});
