import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthenticatedUser,
  RequestWithUser,
} from '../types/authenticated-user.interface';

export function currentUserFactory(
  context: ExecutionContext,
): AuthenticatedUser | undefined {
  const request = context.switchToHttp().getRequest<RequestWithUser>();

  return request.user;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => currentUserFactory(context),
);
