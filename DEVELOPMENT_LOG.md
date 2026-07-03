# Development Log — Phoenix Backend

## 2026-07-03 — Initial boilerplate

### What was created

- NestJS + TypeScript project scaffold
- Minimal folder structure:
  - `src/common/` — placeholder for shared helpers
  - `src/config/` — placeholder for configuration
  - `src/health/` — health check module
- `GET /health` endpoint returning service status and timestamp
- `.gitignore` excluding `.env` and `.env.local`
- `.env.example` template (existing `.env` preserved)
- `README.md` with setup and run instructions

### How to run

```bash
cd backend
npm install
npm run start:dev
```

- API: `http://localhost:4000`
- Health check: `http://localhost:4000/health`

Other useful commands:

```bash
npm run build
npm run start:prod
npm run test
npm run test:e2e
```

### Intentionally not implemented yet

- Authentication (JWT, OAuth, sessions)
- Prisma / database integration
- Swagger / OpenAPI
- AI provider modules
- WhatsApp webhooks
- Meal logging / Food Engine
- Subscriptions and billing
- Admin modules
- Cron jobs
- Standard API response wrapper and shared pagination helpers
- Business domain modules (users, dashboard, onboarding, etc.)

These will be added in later phases per the Project Phoenix docs.

## 2026-07-03 — Backend Foundation 2.1

### What changed

- Added global API prefix `/api/v1`.
- Added `@nestjs/config` setup with environment validation.
- Added required environment validation for:
  - `NODE_ENV`
  - `PORT`
  - `DATABASE_URL`
  - `DIRECT_URL`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `GEMINI_API_KEY`
- Added optional environment support for:
  - `RESEND_API_KEY`
  - `WHATSAPP_VERIFY_TOKEN`
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `CORS_ORIGINS`
- Added global validation pipe with whitelist, transform, and non-whitelisted rejection.
- Added global exception filter using the Project Phoenix standard error response format.
- Added global response interceptor and success response helper.
- Added configurable CORS with safe local development defaults.
- Added Swagger in development at `/api/docs`.
- Updated health endpoint to `GET /api/v1/health` with standard response wrapper.

### Intentionally not implemented

- Prisma/database client
- Authentication flows
- User modules
- AI provider logic
- WhatsApp webhook
- Admin modules
- Business features

### Validation

- `npm run build`
- `npm run test`

## 2026-07-03 — Backend Foundation 2.2

### What changed

- Installed Prisma CLI and Prisma Client.
- Added `prisma/schema.prisma`.
- Configured Prisma datasource with:
  - `DATABASE_URL`
  - `DIRECT_URL`
- Configured Prisma Client generation.
- Added a minimal non-product `FoundationMigrationCheck` model only to verify migrations.
- Added `PrismaService`.
- Added `PrismaModule`.
- Imported Prisma into the backend application.
- Verified database connection during Nest application startup through Prisma `$connect()`.
- Extended `GET /api/v1/health` to include:
  - `database.connected`
- Added `GET /api/v1/health/ready` for a simple Prisma readiness check.
- Created and applied the initial Prisma migration:
  - `20260703125907_foundation_2_2_prisma_setup`

### Prisma commands executed

```bash
npm install @prisma/client
npm install -D prisma
npm install @prisma/client@6.19.3
npm install -D prisma@6.19.3
npx prisma validate
npx prisma generate
npx prisma migrate dev --name foundation_2_2_prisma_setup
npx prisma migrate status
```

### Validation

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate status`
- `npm run lint`
- `npm run build`
- `npm run test`
- `npm run test:e2e`

### Intentionally not implemented

- Product Prisma models
- User/auth schema
- Meal/weight/AI/memory/subscription tables
- Auth/JWT flows
- WhatsApp webhook
- Admin modules
- Business logic

## 2026-07-03 — Authentication Module 3.1

### What changed

- Added `UserStatus` enum:
  - `ACTIVE`
  - `INACTIVE`
  - `SUSPENDED`
  - `DELETED`
- Added `User` Prisma model.
- Added `RefreshToken` Prisma model.
- Added `User` to `RefreshToken` relationship.
- Added UUID primary keys using `@default(uuid())`.
- Added soft-delete foundation through `User.deletedAt`.
- Created and applied Prisma migration:
  - `20260703131635_auth_3_1_user_refresh_token`

### Prisma commands executed

```bash
npx prisma validate
npx prisma generate
npx prisma migrate dev --name auth_3_1_user_refresh_token
```

### Validation

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate dev --name auth_3_1_user_refresh_token`
- `npm run lint`
- `npm run build`
- `npm run test`
- `npm run test:e2e`

### Intentionally not implemented

- Auth service
- Auth controller
- DTOs
- JWT logic
- Register/login APIs
- Google OAuth
- WhatsApp
- Admin
- Business features

## 2026-07-03 - Authentication Module 3.2

### What changed

- Installed `argon2`.
- Added Auth module.
- Added Auth controller.
- Added Auth service.
- Added Signup DTO.
- Added `POST /api/v1/auth/signup`.
- Used request field `fullName` and stored it in `User.fullName`.
- Normalized email by trimming and lowercasing before lookup/write.
- Added Argon2id password hashing.
- Added duplicate email handling with:
  - pre-write lookup,
  - Prisma unique constraint fallback handling.
- Returned standard API response shape.
- Added unit tests for signup user creation, password hashing, email normalization, and duplicate email rejection.
- Added e2e tests for successful signup, duplicate email conflict, and invalid payload validation.

### Commands executed

```bash
npm install argon2
npm run lint
npm run build
npm run test
npm run test:e2e
```

### Validation

- `npm run lint`
- `npm run build`
- `npm run test`
- `npm run test:e2e`

### Intentionally not implemented

- Login
- JWT token issuance
- Refresh token creation
- Logout
- Google OAuth
- Password reset
- Email verification
- User profile
- Admin auth
- Frontend/admin changes
