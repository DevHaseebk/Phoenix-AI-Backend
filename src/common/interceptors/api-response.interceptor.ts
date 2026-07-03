import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../responses/api-response.interface';
import { successResponse } from '../responses/response.helper';

function isApiResponse(value: unknown): value is ApiResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    'message' in value &&
    'data' in value
  );
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse> {
    return next
      .handle()
      .pipe(
        map((data: unknown) =>
          isApiResponse(data) ? data : successResponse(data),
        ),
      );
  }
}
