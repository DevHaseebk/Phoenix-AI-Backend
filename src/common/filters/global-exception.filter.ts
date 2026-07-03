import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorResponse } from '../responses/api-response.interface';

interface HttpExceptionBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

function normalizeErrorCode(status: HttpStatus): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return Number(status) >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
  }
}

function normalizeDetails(response: string | object): unknown[] {
  if (typeof response === 'string') {
    return [{ message: response }];
  }

  const body = response as HttpExceptionBody;

  if (Array.isArray(body.message)) {
    return body.message.map((message) => ({ message }));
  }

  if (typeof body.message === 'string') {
    return [{ message: body.message }];
  }

  return [];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = Number(
      isHttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : 'Internal server error';
    const details = normalizeDetails(exceptionResponse);

    const body: ApiErrorResponse = {
      success: false,
      message:
        status === Number(HttpStatus.BAD_REQUEST)
          ? 'Validation failed'
          : 'Request failed',
      error: {
        code: normalizeErrorCode(status),
        details,
      },
    };

    response.status(status).json(body);
  }
}
