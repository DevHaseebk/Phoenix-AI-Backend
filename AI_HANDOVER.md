# AI Handover

## Current State

Authentication Module Task 3.3 implementation is complete, but the live Prisma migration application is blocked by a schema engine/database reachability error.

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
- login endpoint at `POST /api/v1/auth/login`,
- Argon2id password hashing,
- duplicate email handling,
- JWT access token signing,
- opaque refresh token generation,
- SHA-256 refresh token hash storage,
- multi-device login support through one `RefreshToken` row per login.

Current Prisma schema contains:

- `FoundationMigrationCheck`
- `User`
- `RefreshToken`
- `UserStatus`

`FoundationMigrationCheck` exists only to verify migrations and should not be treated as an application domain model.

Pending Prisma schema change:

- `RefreshToken.deviceType String?`
- Migration file: `20260705170000_auth_3_3_login_device_type`
- `npx prisma migrate dev --name auth_3_3_login_device_type` failed with `Error: Schema engine error:` against the configured Supabase database, so the live DB may not have the `deviceType` column yet.

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

Resolve/apply the pending Prisma migration, then plan the refresh endpoint and token rotation slice.

## Guardrails

- Signup currently creates a user only; login issues JWT access tokens and opaque refresh tokens.
- Do not add refresh endpoint, logout, refresh token rotation, auth guards, protected routes, Google OAuth, password reset, email verification, WhatsApp, admin, or business modules unless explicitly approved.
- Do not expand Prisma beyond the approved next schema task.
- Keep future work inside `backend` unless explicitly instructed otherwise.

## Auth Notes

- Signup request fields are `fullName`, `email`, and `password`.
- `fullName` is stored in `User.fullName`.
- Email is trimmed/lowercased before duplicate checks and writes.
- Passwords are hashed with Argon2id through the `argon2` package.
- Signup response intentionally omits tokens for Task 3.2.
- Login request fields are `email`, `password`, and optional `device.deviceName` / `device.deviceType`.
- Login response uses `fullName`, not `name`.
- Access token expiry is `JWT_ACCESS_EXPIRES_IN=15m`.
- Refresh token expiry is `JWT_REFRESH_EXPIRES_IN=30d`.
- Refresh tokens are opaque random tokens; only SHA-256 hashes are stored.
- Failed login paths use the generic message `Invalid email or password`.

## Prisma Notes

- Prisma CLI and Client are pinned to `6.19.3` because Prisma 7 requires a newer Node version than the current local runtime.
- Migration applied: `20260703125907_foundation_2_2_prisma_setup`.
- Migration applied: `20260703131635_auth_3_1_user_refresh_token`.
- Migration created but not applied from this environment: `20260705170000_auth_3_3_login_device_type`.
