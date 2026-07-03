import { ApiResponse } from './api-response.interface';

export function successResponse<TData, TMeta = Record<string, never>>(
  data: TData,
  message = 'Fetched successfully',
  meta?: TMeta,
): ApiResponse<TData, TMeta> {
  return {
    success: true,
    message,
    data,
    ...(meta === undefined ? {} : { meta }),
  };
}
