# AI Handover

## Current State

Authentication Module Task 3.3, User/Profile Tasks 4.1-4.4, Onboarding Tasks 5.2-5.3, Core Logs WeightLog Tasks 7.1-7.2, Core Logs WaterLog Tasks 7.3-7.4, Core Logs ExerciseLog Tasks 7.5-7.6, Core Logs MealLog Tasks 8.2-8.4, Dashboard Tasks 9.2-9.3, Auth Session Tasks 10.1-10.2, and Backend Task 6.1 AI Chat Foundation with Gemini are complete.

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
- refresh endpoint at `POST /api/v1/auth/refresh`,
- logout endpoint at `POST /api/v1/auth/logout`,
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
- password change endpoint at `PATCH /api/v1/me/password`,
- `UserProfile` Prisma model,
- `UserOnboarding` Prisma model,
- onboarding endpoint at `GET /api/v1/onboarding`,
- onboarding step endpoint at `POST /api/v1/onboarding/step`,
- onboarding completion endpoint at `POST /api/v1/onboarding/complete`,
- deterministic backend calorie/protein target calculation,
- safe onboarding draft continuation state,
- MVP first-win options after onboarding completion,
- `WeightLog` Prisma model,
- `WeightLogSource` enum,
- `User.weightLogs` relation,
- weight log endpoint at `GET /api/v1/logs/weight`,
- weight log endpoint at `POST /api/v1/logs/weight`,
- `WaterLog` Prisma model,
- `WaterLogSource` enum,
- `User.waterLogs` relation,
- water log endpoint at `GET /api/v1/logs/water`,
- water log endpoint at `POST /api/v1/logs/water`,
- `ExerciseLog` Prisma model,
- `ExerciseLogSource` enum,
- `ExerciseType` enum,
- `User.exerciseLogs` relation,
- exercise log endpoint at `GET /api/v1/logs/exercise`,
- exercise log endpoint at `POST /api/v1/logs/exercise`,
- `MealLog` Prisma model,
- `MealLogItem` Prisma model,
- `MealType` enum,
- `MealLogSource` enum,
- `MealLogStatus` enum,
- `ConfidenceLevel` enum,
- `User.mealLogs` relation,
- meal log endpoint at `POST /api/v1/logs/meals`,
- meal log endpoint at `GET /api/v1/logs/meals`,
- meal log endpoint at `GET /api/v1/logs/meals/:id`,
- meal log endpoint at `PATCH /api/v1/logs/meals/:id`,
- meal log endpoint at `DELETE /api/v1/logs/meals/:id`,
- dashboard today endpoint at `GET /api/v1/dashboard/today`,
- dashboard summary endpoint at `GET /api/v1/dashboard/summary`,
- AI chat endpoint at `POST /api/v1/ai/chat`,
- AI meal estimate endpoint at `POST /api/v1/ai/meal-estimate`,
- AI meal confirm endpoint at `POST /api/v1/ai/meal-confirm`,
- AI conversation list endpoint at `GET /api/v1/ai/conversations`,
- AI conversation detail endpoint at `GET /api/v1/ai/conversations/:id`,
- AI conversation archive endpoint at `DELETE /api/v1/ai/conversations/:id`.

Current Prisma schema contains:

- `FoundationMigrationCheck`
- `User`
- `RefreshToken`
- `UserStatus`
- `UserProfile`
- `UserOnboarding`
- `Gender`
- `GoalType`
- `GoalPace`
- `ActivityLevel`
- `OnboardingStatus`
- `WeightLog`
- `WeightLogSource`
- `WaterLog`
- `WaterLogSource`
- `ExerciseLog`
- `ExerciseLogSource`
- `ExerciseType`
- `MealLog`
- `MealLogItem`
- `MealType`
- `MealLogSource`
- `MealLogStatus`
- `ConfidenceLevel`
- `AiConversation`
- `AiMessage`
- `AiMealEstimate`
- `AiConversationType`
- `AiConversationStatus`
- `AiMessageRole`
- `AiMealEstimateStatus`

`FoundationMigrationCheck` exists only to verify migrations and should not be treated as an application domain model.

User/Profile Tasks 4.1-4.4 required no Prisma schema changes and no migrations. `UserProfile` and `UserOnboarding` were later added by Onboarding Task 5.2.

Latest Prisma schema change:

- `MealLog`
- `MealLogItem`
- `MealType`
- `MealLogSource`
- `MealLogStatus`
- `ConfidenceLevel`
- `User.mealLogs`
- Migration file: `20260706123309_meal_log`
- Migration was applied successfully.
- `npx prisma migrate status` reports the database schema is up to date.
- Dashboard Tasks 9.2-9.3 made no Prisma schema changes and created no migrations.

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

Start frontend/user app integration for the completed backend APIs, or build the frontend AI chat UI if the investor-demo path prioritizes AI.

## Guardrails

- Signup currently creates a user only; login issues JWT access tokens and opaque refresh tokens.
- Refresh renews access tokens using a body `refreshToken`.
- Logout revokes refresh tokens using a body `refreshToken`.
- Do not add refresh token rotation, Google OAuth, password reset, email verification, WhatsApp, admin, or additional business modules unless explicitly approved.
- Do not expand Prisma beyond the approved next schema task.
- Keep future work inside `backend` unless explicitly instructed otherwise.
- Add rate limiting/brute-force protection before public beta.
- Do not add WhatsApp or Admin modules until explicitly approved.
- Logs module currently contains WeightLog, WaterLog, ExerciseLog, and MealLog.

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
- `POST /api/v1/auth/refresh` accepts `refreshToken` in the body, hashes it with SHA-256, rejects missing/unknown/revoked/expired tokens generically, rejects missing/inactive/deleted users, and returns `accessToken` plus `expiresIn`.
- Refresh token rotation is deferred.
- `POST /api/v1/auth/logout` accepts `refreshToken` in the body, sets `revokedAt` for matching active tokens, and returns success for valid, already revoked, and unknown tokens.
- Logout does not require an access token and does not delete refresh token rows.
- Frontend session flow is ready: login gets tokens, refresh renews access token, logout revokes refresh token.
- Failed login paths use the generic message `Invalid email or password`.
- `JwtAuthGuard` verifies the access token and re-checks the user is active and not deleted.
- `@CurrentUser()` provides `userId`, `email`, and `status`.

## User/Profile Notes

- `GET /api/v1/me` returns safe current user data.
- `PATCH /api/v1/me/profile` updates only `fullName` and `phone`.
- `PATCH /api/v1/me/password` verifies the current password, stores only an Argon2id hash for the new password, and revokes existing active refresh tokens.
- User/Profile responses do not include `passwordHash`.

## Onboarding Notes

- `GET /api/v1/onboarding` returns existing onboarding state or a default `NOT_STARTED` state.
- `POST /api/v1/onboarding/step` saves step data into `UserOnboarding.draft` and returns safe draft state for frontend continuation.
- `POST /api/v1/onboarding/complete` upserts `UserProfile` and marks `UserOnboarding` as `COMPLETED`.
- Calorie and protein targets are calculated by deterministic backend logic, not AI.
- Clients cannot provide `calorieTarget` or `proteinTargetGrams`.
- Completion returns first-win options:
  - `UPDATE_WEIGHT`
  - `LOG_FIRST_MEAL`
  - `LOG_WATER`
  - `OPEN_DASHBOARD`

## Core Logs Notes

- `GET /api/v1/logs/weight` lists the authenticated user's weight logs only.
- `POST /api/v1/logs/weight` creates a weight log for the authenticated user only.
- Both WeightLog routes use `JwtAuthGuard` and `@CurrentUser()`.
- `WeightLogSource` values are `MANUAL`, `ONBOARDING`, and `IMPORTED`.
- `source` is not client-controlled for `POST /api/v1/logs/weight`; the service defaults it to `MANUAL`.
- WeightLog safe responses include `id`, `weightKg`, `loggedAt`, `source`, `note`, `createdAt`, and `updatedAt`.
- `UserProfile.currentWeightKg` is not updated by WeightLog creation yet. Synchronization is deferred until dashboard/current-weight rules are defined.
- `GET /api/v1/logs/water` lists the authenticated user's water logs only.
- `POST /api/v1/logs/water` creates a water log for the authenticated user only.
- Both WaterLog routes use `JwtAuthGuard` and `@CurrentUser()`.
- `WaterLogSource` values are `MANUAL`, `QUICK_ADD`, and `IMPORTED`.
- `source` is not client-controlled for `POST /api/v1/logs/water`; the service defaults it to `MANUAL`.
- WaterLog safe responses include `id`, `amountMl`, `loggedAt`, `source`, `note`, `createdAt`, and `updatedAt`.
- Profile fields are not updated by WaterLog APIs yet.
- `GET /api/v1/logs/exercise` lists the authenticated user's exercise logs only and supports `exerciseType` filtering.
- `POST /api/v1/logs/exercise` creates an exercise log for the authenticated user only.
- Both ExerciseLog routes use `JwtAuthGuard` and `@CurrentUser()`.
- `ExerciseLogSource` values are `MANUAL`, `DEVICE`, and `IMPORTED`.
- `ExerciseType` values are `WALKING`, `RUNNING`, `CYCLING`, `STRENGTH`, `CARDIO`, `SPORTS`, `STEPS`, and `OTHER`.
- `source` is not client-controlled for `POST /api/v1/logs/exercise`; the service defaults it to `MANUAL`.
- ExerciseLog safe responses include `id`, `exerciseType`, `durationMinutes`, `steps`, `distanceKm`, `estimatedCaloriesBurned`, `loggedAt`, `source`, `note`, `createdAt`, and `updatedAt`.
- `distanceKm` Decimal is serialized as a plain number.
- Profile fields are not updated by ExerciseLog APIs yet.
- `POST /api/v1/logs/meals` creates a meal log for the authenticated user only.
- `GET /api/v1/logs/meals` lists the authenticated user's meal logs only.
- `GET /api/v1/logs/meals/:id` returns one authenticated-user-owned meal log only.
- `PATCH /api/v1/logs/meals/:id` updates one authenticated-user-owned meal log only.
- `DELETE /api/v1/logs/meals/:id` hard deletes one authenticated-user-owned meal log for MVP because schema has no `deletedAt`.
- All MealLog routes use `JwtAuthGuard` and `@CurrentUser()`.
- `MealType` values are `BREAKFAST`, `LUNCH`, `DINNER`, `SNACK`, and `CUSTOM`.
- `MealLogSource` values are `MANUAL`, `AI_CHAT`, `WHATSAPP`, and `IMPORTED`.
- `MealLogStatus` values are `LOGGED`, `ESTIMATED`, and `NEEDS_REVIEW`.
- `ConfidenceLevel` values are `LOW`, `MEDIUM`, `HIGH`, and `VERIFIED`.
- `source`, `status`, `confidenceLevel`, and meal totals are not client-controlled for MealLog APIs.
- MealLog update supports meal field updates and item replacement; totals are recalculated from items when items are replaced.
- MealLogItem rows are created and returned correctly.
- MealLog safe responses include `id`, `mealType`, `description`, totals, `status`, `confidenceLevel`, `source`, `loggedAt`, `note`, `createdAt`, `updatedAt`, and `items`.
- Decimal-backed MealLog totals and MealLogItem fields are serialized as plain numbers.
- Profile fields are not updated by MealLog APIs yet.
- `.gitignore` was fixed from `logs` to `/logs` so `src/logs` source files are not hidden from Git.
- Manual Postman verification was completed successfully by the developer for implemented APIs.

## Dashboard Notes

- Dashboard module is implemented.
- `GET /api/v1/dashboard/today` is complete.
- `GET /api/v1/dashboard/summary` is complete.
- Dashboard routes use `JwtAuthGuard` and `@CurrentUser()`.
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
- Invalid Dashboard summary range returns `400`.
- Dashboard uses `UserProfile.timezone` when available and falls back to `Asia/Karachi`.
- Dashboard date boundaries are calculated by local user timezone and converted to UTC for Prisma queries.
- Summary averages are divided by total days in range.
- `weightChangeKg` returns `null` when fewer than two weight logs exist.
- Dashboard has deterministic `aiFocus` placeholder; no AI call is made.
- `weeklyReview` and `rewardsPreview` are placeholders.
- Decimal-backed Dashboard values are serialized as plain numbers.
- All Dashboard log queries are scoped to the authenticated user only.
- Dashboard Tasks 9.2-9.3 made no Prisma schema changes and created no migrations.

## Prisma Notes

- Prisma CLI and Client are pinned to `6.19.3` because Prisma 7 requires a newer Node version than the current local runtime.
- Migration applied: `20260703125907_foundation_2_2_prisma_setup`.
- Migration applied: `20260703131635_auth_3_1_user_refresh_token`.
- Migration applied: `20260705170000_auth_3_3_login_device_type`.
- Migration applied: `20260705180108_onboarding_profile`.
- Migration applied: `20260706072703_weight_log`.
- Migration applied: `20260706074733_water_log`.
- Migration applied: `20260706114403_exercise_log`.
- Migration applied: `20260706123309_meal_log`.
- Migration applied: `20260707071051_ai_chat_foundation`.
- No Dashboard migration exists because Dashboard Tasks 9.2-9.3 did not require schema changes.

## AI Notes

- Gemini is the primary AI provider via `@google/genai`.
- No OpenAI implementation is present.
- `GEMINI_API_KEY` is optional in local/development so the app can run without a live AI key.
- Production requires `GEMINI_API_KEY` when `AI_ENABLED=true`.
- `GEMINI_MODEL` defaults to `gemini-2.5-flash`.
- `AI_PROVIDER` defaults to `gemini`.
- `AI_ENABLED` defaults to `true`.
- `AI_TIMEOUT_MS` defaults to `30000`.
- Local/dev fallback is deterministic and clearly labeled as local fallback; it does not pretend to be a real AI estimate.
- `POST /api/v1/ai/chat` saves user and assistant messages in an owned `AiConversation`.
- `POST /api/v1/ai/meal-estimate` uses structured Gemini JSON, normalizes/sanity-checks nutrition values, stores `AiMealEstimate`, and does not create a `MealLog`.
- `POST /api/v1/ai/meal-confirm` verifies estimate ownership, rejects already confirmed/non-confirmable estimates, creates a `MealLog` with source `AI_CHAT`, creates `MealLogItem` rows, and marks the estimate `CONFIRMED`.
- `AiMealEstimate.mealLogId` is a plain `String?` MVP link; no strict `MealLog` relation was added.
- AI safety guardrails block unsafe dieting, eating disorder, self-harm, and medication dosing prompts.
- AI endpoint rate limiting remains a public-beta hardening TODO.

## Validation Notes

- `npm run lint` passed.
- `npm run build` passed.
- `npm run test` passed with 24 suites / 104 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand` passed with 10 suites / 80 tests.
- `npx prisma migrate status` reports the database schema is up to date.
- First parallel test run had Argon2-related timeout pressure, but the required suites passed when rerun sequentially.
- No current blocker remains from Authentication, Auth Session, User/Profile, Onboarding, Core Logs Weight/Water/Exercise/Meal Tasks 7.1-8.4, or Dashboard Tasks 9.2-9.3.
