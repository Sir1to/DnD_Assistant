import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = response.getHeader('x-request-id')?.toString() ?? 'unknown';
    const message =
      exception instanceof HttpException && status < 500
        ? this.getPublicMessage(exception)
        : 'Unexpected server error';

    this.logger.error(
      {
        requestId,
        method: request.method,
        path: request.originalUrl,
        status,
        error: exception instanceof Error ? exception.message : 'Unknown error',
      },
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      error: {
        code: exception instanceof HttpException ? exception.name.toUpperCase() : 'INTERNAL_ERROR',
        message,
        requestId,
      },
    });
  }

  private getPublicMessage(exception: HttpException): string {
    const body = exception.getResponse();

    if (typeof body === 'string') {
      return body;
    }

    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = body.message;
      return Array.isArray(message) ? message.join('; ') : String(message);
    }

    return exception.message;
  }
}
