# Current Task

Task: Auth Session Tasks 10.1-10.2

Status: Completed

Scope:

- Auth refresh endpoint is implemented.
- `POST /api/v1/auth/refresh` accepts `refreshToken` in the request body.
- Refresh hashes opaque refresh tokens using the existing SHA-256 pattern.
- Refresh rejects missing, unknown, revoked, or expired tokens with generic `Unauthorized`.
- Refresh rejects missing, inactive, or deleted users.
- Refresh returns a new `accessToken` and `expiresIn`.
- Refresh token rotation is deferred.
- Auth logout endpoint is implemented.
- `POST /api/v1/auth/logout` accepts `refreshToken` in the request body.
- Logout revokes matching refresh tokens by setting `revokedAt`.
- Logout is idempotent:
  - valid token returns success
  - already revoked token returns success
  - unknown token returns success
- Logout does not require an access token.
- Logout does not delete refresh token rows.
- Frontend session flow is ready:
  - login gets `accessToken` and `refreshToken`
  - refresh renews `accessToken`
  - logout revokes `refreshToken`
- Dashboard module is implemented.
- `GET /api/v1/dashboard/today` is complete.
- `GET /api/v1/dashboard/summary` is complete.
- Dashboard routes are protected by `JwtAuthGuard` and use `@CurrentUser()`.
- Dashboard today aggregates:
  - `UserProfile` targets/timezone
  - `WeightLog` progress
  - `MealLog` calories/protein/timeline
  - `WaterLog` daily intake
  - `ExerciseLog` steps/duration/calories burned
- Dashboard summary supports:
  - `range=7d`
  - `range=30d`
  - `range=90d`
  - default `range=7d`
- Invalid summary range returns `400`.
- Dashboard uses `UserProfile.timezone` when available and falls back to `Asia/Karachi`.
- Date boundaries are calculated by local user timezone and converted to UTC for Prisma queries.
- Summary averages are divided by total days in range.
- `weightChangeKg` returns `null` when fewer than two weight logs exist.
- Dashboard has deterministic `aiFocus` placeholder; no AI call is made.
- `weeklyReview` and `rewardsPreview` are placeholders.
- Decimal-backed values are serialized as plain numbers.
- All dashboard log queries are scoped to the current user only.
- No Prisma schema changes or migrations were made for Dashboard.
- Core Logs are complete:
  - WeightLog
  - WaterLog
  - ExerciseLog
  - MealLog
- Completed backend modules now include:
  - Foundation
  - Prisma/Supabase
  - Auth
  - User/Profile
  - Onboarding
  - Core Logs: Weight, Water, Exercise, Meal
  - Dashboard
- Validation passed:
  - lint
  - build
  - unit tests: 20 suites / 93 tests
  - e2e tests: 9 suites / 76 tests
- First parallel test run had Argon2-related timeout pressure, but the required suites passed when rerun sequentially.

Out of scope:

- AI
- Food Engine
- WhatsApp
- Admin
- Token rotation
- Google OAuth
- Password reset
- Email verification
- Rate limiting/brute-force protection before public beta
- Security headers / Helmet if not already implemented
- Production CORS allowlist verification
- Frontend/admin changes
- Other business features
