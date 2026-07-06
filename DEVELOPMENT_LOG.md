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

## 2026-07-05 - Authentication Module 3.3

### What changed

- Installed `@nestjs/jwt`.
- Added required environment variables:
  - `JWT_ACCESS_EXPIRES_IN=15m`
  - `JWT_REFRESH_EXPIRES_IN=30d`
- Added Login DTO.
- Added `POST /api/v1/auth/login`.
- Added JWT access token signing.
- Added opaque refresh token generation using Node `crypto`.
- Added SHA-256 refresh token hashing using Node `crypto`.
- Added `RefreshToken.deviceType String?` to Prisma schema.
- Added migration SQL:
  - `20260705170000_auth_3_3_login_device_type`
- Stored only refresh token hash, never the raw refresh token.
- Created one `RefreshToken` row per successful login.
- Added `User.lastActiveAt` update on successful login.
- Kept login error message generic: `Invalid email or password`.
- Added unit tests for successful login, token creation, refresh token hashing, invalid credentials, and suspended users.
- Added e2e tests for successful login and generic unauthorized login response.
- Updated health e2e test to override Prisma provider before app initialization so tests do not require live database connectivity.

### Commands executed

```bash
npm install @nestjs/jwt
npx prisma validate
npx prisma generate
npx prisma migrate dev --name auth_3_3_login_device_type
npm run lint
npm run build
npm run test
npm run test:e2e
```

### Validation

- `npx prisma validate` passed.
- `npx prisma generate` passed.
- Initial `npx prisma migrate dev --name auth_3_3_login_device_type` failed with `Error: Schema engine error:` against the direct Supabase database host.
- The migration issue was resolved by using the Supabase Session Pooler connection string from `.env`.
- `npx prisma migrate dev --name auth_3_3_login_device_type` then applied migration `20260705170000_auth_3_3_login_device_type` successfully.
- `npx prisma migrate status` reports the database schema is up to date.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed.
- `npm run test:e2e` passed.

### Intentionally not implemented

- Refresh endpoint
- Logout
- Token rotation
- Google OAuth
- Password reset
- Email verification
- Rate limiting/brute-force protection before public beta
- Frontend/admin changes

## 2026-07-05 - User/Profile Tasks 4.1-4.4

### What changed

- Added JWT Auth Guard.
- Added `@CurrentUser()` decorator.
- Added authenticated user context type containing:
  - `userId`
  - `email`
  - `status`
- Added `GET /api/v1/me`.
- Added `PATCH /api/v1/me/profile`.
- Added `PATCH /api/v1/me/password`.
- Added Users module/controller/service.
- Added safe current user response shape.
- Added basic profile update for:
  - `fullName`
  - `phone`
- Added password change using:
  - Argon2 verify for current password,
  - Argon2id hashing for new password.
- Password change revokes existing active refresh tokens by setting `revokedAt`.
- Added unit and e2e tests for guard/decorator and User/Profile endpoints.

### Prisma

- No Prisma schema changes were made for User/Profile Tasks 4.1-4.4.
- No migrations were created or run for User/Profile Tasks 4.1-4.4.
- No UserProfile Prisma model was added during User/Profile Tasks 4.1-4.4.

### Validation

- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed.
- `npm run test:e2e` passed.

### Current status

- User/Profile MVP backend scope is complete unless timezone/language or a separate UserProfile model is required for onboarding/personalization.

### Intentionally not implemented

- Refresh endpoint
- Logout
- Password reset
- Google OAuth
- Rate limiting/brute-force protection before public beta
- Separate UserProfile model during User/Profile Tasks 4.1-4.4; later added by Onboarding Task 5.2
- Timezone/preferredLanguage fields on `UserProfile`; later added by Onboarding Task 5.2

## 2026-07-05 - Onboarding Tasks 5.2-5.3

### What changed

- Added MVP onboarding Prisma schema.
- Added `UserProfile` Prisma model.
- Added `UserOnboarding` Prisma model.
- Added onboarding enums:
  - `Gender`
  - `GoalType`
  - `GoalPace`
  - `ActivityLevel`
  - `OnboardingStatus`
- Added relations from `User` to `UserProfile` and `UserOnboarding`.
- Created and applied Prisma migration:
  - `20260705180108_onboarding_profile`
- Added Onboarding module/controller/service.
- Added protected onboarding endpoints:
  - `GET /api/v1/onboarding`
  - `POST /api/v1/onboarding/step`
  - `POST /api/v1/onboarding/complete`
- Added deterministic backend target calculation for calorie and protein targets.
- Kept target calculation non-AI for MVP.
- `POST /api/v1/onboarding/step` saves step data into `UserOnboarding.draft` and returns safe draft state.
- `POST /api/v1/onboarding/complete` returns MVP first-win options:
  - `UPDATE_WEIGHT`
  - `LOG_FIRST_MEAL`
  - `LOG_WATER`
  - `OPEN_DASHBOARD`
- Regenerated Prisma Client after onboarding schema changes.

### Prisma commands executed

```bash
npx prisma format
npx prisma generate
npx prisma migrate dev --name onboarding_profile
npx prisma migrate status
```

### Validation

- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed:
  - 9 suites
  - 34 tests
- `npm run test:e2e` passed:
  - 4 suites
  - 24 tests
- `npx prisma migrate status` reports the database schema is up to date.

### Intentionally not implemented

- Dashboard module
- AI provider logic
- WhatsApp webhook
- Admin modules
- Water, exercise, or meal logging models at that time; WaterLog, ExerciseLog, and MealLog were later added by Core Logs Tasks 7.3-8.4

## 2026-07-06 - Core Logs WeightLog Tasks 7.1-7.2

### What changed

- Added `WeightLogSource` enum:
  - `MANUAL`
  - `ONBOARDING`
  - `IMPORTED`
- Added `WeightLog` Prisma model.
- Added `User.weightLogs` relation.
- Added WeightLog indexes:
  - `userId`
  - `loggedAt`
  - `userId + loggedAt`
- Created and applied Prisma migration:
  - `20260706072703_weight_log`
- Added Logs module.
- Added WeightLog service/controller/DTOs.
- Added protected WeightLog endpoints:
  - `GET /api/v1/logs/weight`
  - `POST /api/v1/logs/weight`
- Both WeightLog routes use `JwtAuthGuard` and `@CurrentUser()`.
- `POST /api/v1/logs/weight` creates logs for the authenticated user only.
- `GET /api/v1/logs/weight` lists logs for the authenticated user only.
- `UserProfile.currentWeightKg` update is deferred until dashboard/current-weight synchronization rules are defined.
- Fixed `.gitignore` from `logs` to `/logs` so `src/logs` source files are not hidden from Git.

### Prisma commands executed

```bash
npx prisma format
npx prisma migrate status
npx prisma migrate dev --name weight_log
npx prisma migrate status
```

### Validation

- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed:
  - 11 suites
  - 40 tests
- `npm run test:e2e` passed:
  - 5 suites
  - 29 tests

### Intentionally not implemented at that time

- Dashboard
- AI provider logic
- WhatsApp webhook
- Admin modules

## 2026-07-06 - Core Logs ExerciseLog Tasks 7.5-7.6

### What changed

- Added `ExerciseLogSource` enum:
  - `MANUAL`
  - `DEVICE`
  - `IMPORTED`
- Added `ExerciseType` enum:
  - `WALKING`
  - `RUNNING`
  - `CYCLING`
  - `STRENGTH`
  - `CARDIO`
  - `SPORTS`
  - `STEPS`
  - `OTHER`
- Added `ExerciseLog` Prisma model.
- Added `User.exerciseLogs` relation.
- Added ExerciseLog indexes:
  - `userId`
  - `loggedAt`
  - `userId + loggedAt`
- Created and applied Prisma migration:
  - `20260706114403_exercise_log`
- Added ExerciseLog service/controller/DTOs.
- Added protected ExerciseLog endpoints:
  - `GET /api/v1/logs/exercise`
  - `POST /api/v1/logs/exercise`
- Both ExerciseLog routes use `JwtAuthGuard` and `@CurrentUser()`.
- `POST /api/v1/logs/exercise` creates exercise logs for the authenticated user only.
- `GET /api/v1/logs/exercise` lists exercise logs for the authenticated user only.
- `GET /api/v1/logs/exercise` supports `exerciseType` filtering.
- `distanceKm` Decimal values are safely serialized as plain numbers.
- Dashboard summaries and profile fields are not updated by ExerciseLog APIs yet.
- Manual Postman verification was completed successfully by the developer for implemented APIs.

### Prisma commands executed

```bash
npx prisma format
npx prisma migrate status
npx prisma migrate dev --name exercise_log
npx prisma migrate status
```

### Validation

- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed:
  - 15 suites
  - 52 tests
- `npm run test:e2e` passed:
  - 7 suites
  - 40 tests

### Intentionally not implemented at that time

- Dashboard
- AI provider logic
- WhatsApp webhook
- Admin modules

## 2026-07-06 - Core Logs WaterLog Tasks 7.3-7.4

### What changed

- Added `WaterLogSource` enum:
  - `MANUAL`
  - `QUICK_ADD`
  - `IMPORTED`
- Added `WaterLog` Prisma model.
- Added `User.waterLogs` relation.
- Added WaterLog indexes:
  - `userId`
  - `loggedAt`
  - `userId + loggedAt`
- Created and applied Prisma migration:
  - `20260706074733_water_log`
- Added WaterLog service/controller/DTOs.
- Added protected WaterLog endpoints:
  - `GET /api/v1/logs/water`
  - `POST /api/v1/logs/water`
- Both WaterLog routes use `JwtAuthGuard` and `@CurrentUser()`.
- `POST /api/v1/logs/water` creates water logs for the authenticated user only.
- `GET /api/v1/logs/water` lists water logs for the authenticated user only.
- Dashboard summaries and profile fields are not updated by WaterLog APIs yet.

### Prisma commands executed

```bash
npx prisma format
npx prisma migrate status
npx prisma migrate dev --name water_log
npx prisma migrate status
```

### Validation

- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed:
  - 13 suites
  - 46 tests
- `npm run test:e2e` passed:
  - 6 suites
  - 34 tests

### Intentionally not implemented at that time

- Dashboard
- AI provider logic
- WhatsApp webhook
- Admin modules

## 2026-07-06 - Core Logs MealLog Tasks 8.2-8.4

### What changed

- Added `MealType` enum:
  - `BREAKFAST`
  - `LUNCH`
  - `DINNER`
  - `SNACK`
  - `CUSTOM`
- Added `MealLogSource` enum:
  - `MANUAL`
  - `AI_CHAT`
  - `WHATSAPP`
  - `IMPORTED`
- Added `MealLogStatus` enum:
  - `LOGGED`
  - `ESTIMATED`
  - `NEEDS_REVIEW`
- Added `ConfidenceLevel` enum:
  - `LOW`
  - `MEDIUM`
  - `HIGH`
  - `VERIFIED`
- Added `MealLog` Prisma model.
- Added `MealLogItem` Prisma model.
- Added `User.mealLogs` relation.
- Added MealLog indexes:
  - `userId`
  - `loggedAt`
  - `mealType`
  - `userId + loggedAt`
- Added MealLogItem index:
  - `mealLogId`
- Created and applied Prisma migration:
  - `20260706123309_meal_log`
- Added MealLog service/controller/DTOs.
- Added protected MealLog endpoints:
  - `POST /api/v1/logs/meals`
  - `GET /api/v1/logs/meals`
  - `GET /api/v1/logs/meals/:id`
  - `PATCH /api/v1/logs/meals/:id`
  - `DELETE /api/v1/logs/meals/:id`
- All MealLog routes use `JwtAuthGuard` and `@CurrentUser()`.
- `POST /api/v1/logs/meals` creates meals for the authenticated user only.
- `GET /api/v1/logs/meals` lists meals for the authenticated user only.
- `GET /api/v1/logs/meals/:id` enforces ownership.
- `PATCH /api/v1/logs/meals/:id` enforces ownership, supports meal field updates, supports item replacement, and recalculates totals from items.
- `DELETE /api/v1/logs/meals/:id` enforces ownership and uses hard delete for MVP because schema has no `deletedAt`.
- MealLogItem rows are created and returned correctly.
- Decimal-backed totals and item fields are safely serialized as plain numbers.
- Dashboard summaries and profile fields are not updated by MealLog APIs yet.

### Prisma commands executed

```bash
npx prisma format
npx prisma migrate status
npx prisma migrate dev --name meal_log
npx prisma generate
npx prisma migrate status
```

### Validation

- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed:
  - 17 suites
  - 69 tests
- `npm run test:e2e` passed:
  - 8 suites
  - 54 tests

### Intentionally not implemented

- Dashboard
- AI provider logic
- Food Engine
- WhatsApp webhook
- Admin modules
