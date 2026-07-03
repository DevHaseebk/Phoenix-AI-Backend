# AI Handover

## Current State

Authentication Module Task 3.2 is complete.

The NestJS app now starts with:

- global prefix `/api/v1`,
- config validation from `.env`,
- global DTO validation pipe,
- standard success/error API response shape,
- configurable CORS,
- development Swagger at `/api/docs`,
- health endpoint at `GET /api/v1/health`,
- Prisma configured against Supabase PostgreSQL,
- Prisma Client generated,
- database connection verified during Nest startup,
- Prisma readiness endpoint at `GET /api/v1/health/ready`,
- User Prisma model,
- RefreshToken Prisma model,
- UserStatus enum,
- auth module/controller/service,
- signup endpoint at `POST /api/v1/auth/signup`,
- Argon2id password hashing,
- duplicate email handling.

Current Prisma schema contains:

- `FoundationMigrationCheck`
- `User`
- `RefreshToken`
- `UserStatus`

`FoundationMigrationCheck` exists only to verify migrations and should not be treated as an application domain model.

## Decisions Used

- D-028 REST APIs are MVP default.
- D-029 Swagger documentation required.
- D-031 Standard API response shape.
- D-020 MVP database is PostgreSQL.
- D-021 Prisma ORM is used.
- D-023 Supabase PostgreSQL is used initially.
- D-035 Auth is backend-owned.
- D-036 Use JWT access token + refresh token.
- D-039 Users can login on multiple devices.
- D-041 Account deletion uses soft delete for 30 days.
- D-045 Backend deploys to Render or Railway.
- D-146 MVP is not medical diagnosis or treatment.
- D-150 Documentation first.

## Next Recommended Task

Plan the next authentication slice, likely login plus JWT access token and refresh token issuance.

## Guardrails

- Signup currently creates a user only; it does not issue JWTs or create refresh tokens.
- Do not add login, logout, refresh token rotation, Google OAuth, password reset, email verification, WhatsApp, admin, or business modules unless explicitly approved.
- Do not expand Prisma beyond the approved next schema task.
- Keep future work inside `backend` unless explicitly instructed otherwise.

## Auth Notes

- Signup request fields are `fullName`, `email`, and `password`.
- `fullName` is stored in `User.fullName`.
- Email is trimmed/lowercased before duplicate checks and writes.
- Passwords are hashed with Argon2id through the `argon2` package.
- Signup response intentionally omits tokens for Task 3.2.

## Prisma Notes

- Prisma CLI and Client are pinned to `6.19.3` because Prisma 7 requires a newer Node version than the current local runtime.
- Migration applied: `20260703125907_foundation_2_2_prisma_setup`.
- Migration applied: `20260703131635_auth_3_1_user_refresh_token`.
