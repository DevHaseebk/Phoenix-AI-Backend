# AI Handover

## Current State

Authentication Module Task 3.3 and User/Profile Tasks 4.1-4.4 are complete.

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
- multi-device login support through one `RefreshToken` row per login,
- JWT auth guard,
- `@CurrentUser()` decorator,
- current user endpoint at `GET /api/v1/me`,
- basic profile update endpoint at `PATCH /api/v1/me/profile`,
- password change endpoint at `PATCH /api/v1/me/password`.

Current Prisma schema contains:

- `FoundationMigrationCheck`
- `User`
- `RefreshToken`
- `UserStatus`

`FoundationMigrationCheck` exists only to verify migrations and should not be treated as an application domain model.

No UserProfile Prisma model has been added yet. User/Profile Tasks 4.1-4.4 required no Prisma schema changes and no migrations.

Latest Prisma schema change:

- `RefreshToken.deviceType String?`
- Migration file: `20260705170000_auth_3_3_login_device_type`
- Migration was applied successfully after switching to the Supabase Session Pooler connection string.
- `npx prisma migrate status` reports the database schema is up to date.

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

Plan the next MVP backend module. User/Profile MVP backend scope is complete unless timezone/language or a separate UserProfile model is required for onboarding/personalization.

## Guardrails

- Signup currently creates a user only; login issues JWT access tokens and opaque refresh tokens.
- Do not add refresh endpoint, logout, refresh token rotation, Google OAuth, password reset, email verification, WhatsApp, admin, or business modules unless explicitly approved.
- Do not expand Prisma beyond the approved next schema task.
- Keep future work inside `backend` unless explicitly instructed otherwise.
- Add rate limiting/brute-force protection before public beta.

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
- `JwtAuthGuard` verifies the access token and re-checks the user is active and not deleted.
- `@CurrentUser()` provides `userId`, `email`, and `status`.

## User/Profile Notes

- `GET /api/v1/me` returns safe current user data.
- `PATCH /api/v1/me/profile` updates only `fullName` and `phone`.
- `PATCH /api/v1/me/password` verifies the current password, stores only an Argon2id hash for the new password, and revokes existing active refresh tokens.
- User/Profile responses do not include `passwordHash`.
- No separate UserProfile model exists yet.
- Add UserProfile only if onboarding/personalization requires fields like timezone or preferredLanguage.

## Prisma Notes

- Prisma CLI and Client are pinned to `6.19.3` because Prisma 7 requires a newer Node version than the current local runtime.
- Migration applied: `20260703125907_foundation_2_2_prisma_setup`.
- Migration applied: `20260703131635_auth_3_1_user_refresh_token`.
- Migration applied: `20260705170000_auth_3_3_login_device_type`.

## Validation Notes

- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed.
- `npm run test:e2e` passed.
- No current blocker remains from Authentication or User/Profile Tasks 4.1-4.4.
