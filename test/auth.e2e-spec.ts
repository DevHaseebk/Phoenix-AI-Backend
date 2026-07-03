import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GlobalExceptionFilter } from './../src/common/filters/global-exception.filter';
import { ApiResponseInterceptor } from './../src/common/interceptors/api-response.interceptor';
import { PrismaService } from './../src/prisma/prisma.service';

interface SignupResponseBody {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      fullName: string;
      email: string;
      status: string;
    };
  };
  meta: Record<string, never>;
}

interface ErrorResponseBody {
  success: false;
  message: string;
  error: {
    code: string;
    details: unknown[];
  };
}

describe('Auth signup (e2e)', () => {
  let app: INestApplication<App>;
  const findUnique = jest.fn();
  const create = jest.fn();
  const prisma = {
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: {
      findUnique,
      create,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates an account without returning password data or tokens', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      status: 'ACTIVE',
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        fullName: 'Haseeb',
        email: 'HASEEB@example.com',
        password: 'StrongPassword123',
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as SignupResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Account created successfully');
        expect(body.data.user).toEqual({
          id: 'user-id',
          fullName: 'Haseeb',
          email: 'haseeb@example.com',
          status: 'ACTIVE',
        });
        expect(body.data).not.toHaveProperty('tokens');
        expect(body.data.user).not.toHaveProperty('passwordHash');
      });
  });

  it('returns conflict for duplicate email', async () => {
    findUnique.mockResolvedValue({ id: 'existing-user-id' });

    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        password: 'StrongPassword123',
      })
      .expect(409)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.message).toBe('Request failed');
        expect(body.error.code).toBe('CONFLICT');
      });
  });

  it('rejects invalid signup payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        fullName: 'H',
        email: 'not-an-email',
        password: 'short',
        status: 'ACTIVE',
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.message).toBe('Validation failed');
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.details.length).toBeGreaterThan(0);
      });
  });
});
