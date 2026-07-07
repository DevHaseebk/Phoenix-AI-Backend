# Feature Status

## Foundation

| Feature | Status | Notes |
|---|---|---|
| Global API prefix | Complete | `/api/v1` |
| Config validation | Complete | Required and optional env keys validated at startup |
| Global validation pipe | Complete | `whitelist`, `transform`, `forbidNonWhitelisted` enabled |
| Standard success response | Complete | Helper plus global interceptor |
| Standard error response | Complete | Global exception filter |
| CORS | Complete | `CORS_ORIGINS` with safe dev defaults |
| Swagger | Complete | Development only at `/api/docs` |
| Health endpoint | Complete | `GET /api/v1/health`, includes database status |
| Prisma setup | Complete | Prisma 6.19.3 installed and configured |
| Prisma datasource | Complete | Uses `DATABASE_URL` and `DIRECT_URL` |
| Prisma Client generation | Complete | `npx prisma generate` verified |
| Prisma migration baseline | Complete | Minimal `FoundationMigrationCheck` model only |
| Prisma readiness check | Complete | `GET /api/v1/health/ready` |
| User Prisma model | Complete | Added in Authentication Module 3.1 |
| RefreshToken Prisma model | Complete | Added in Authentication Module 3.1 |
| UserStatus enum | Complete | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `DELETED` |
| Auth module/controller/service | Complete | Added in Authentication Module 3.2 |
| Signup API | Complete | `POST /api/v1/auth/signup`, email/password only |
| Password hashing | Complete | Argon2id via `argon2` |
| Duplicate email handling | Complete | Normalized email pre-check plus Prisma unique constraint handling |
| Login API | Complete | `POST /api/v1/auth/login` |
| JWT access token signing | Complete | 15 minute access token expiry from env |
| Refresh token creation | Complete | Opaque random token, SHA-256 hash stored only |
| Multi-device login | Complete | One `RefreshToken` row per successful login |
| Refresh access token API | Complete | `POST /api/v1/auth/refresh`, body `refreshToken`, returns new `accessToken` and `expiresIn` |
| Logout API | Complete | `POST /api/v1/auth/logout`, body `refreshToken`, idempotently sets `revokedAt` when token exists |
| Frontend session flow | Complete | Login issues tokens; refresh renews access token; logout revokes refresh token |
| RefreshToken deviceType schema | Complete | Migration `20260705170000_auth_3_3_login_device_type` applied via Supabase Session Pooler |
| Database schema status | Complete | `npx prisma migrate status` reports schema is up to date |
| JWT auth guard | Complete | Verifies access token and re-checks active, non-deleted user |
| Current user decorator | Complete | Provides `userId`, `email`, and `status` from authenticated request context |
| Get current user | Complete | `GET /api/v1/me` |
| Update own basic profile | Complete | `PATCH /api/v1/me/profile`, supports `fullName` and `phone` |
| Change own password | Complete | `PATCH /api/v1/me/password`, verifies current password and revokes active refresh tokens |
| User/Profile Prisma changes | Not needed for MVP scope | No UserProfile model, schema change, or migration was added during Tasks 4.1-4.4; `UserProfile` was later added by Onboarding Task 5.2 |
| Onboarding schema | Complete | Added `UserProfile`, `UserOnboarding`, and onboarding enums |
| Onboarding migration | Complete | Migration `20260705180108_onboarding_profile` applied |
| Get onboarding state | Complete | `GET /api/v1/onboarding`, protected by JWT auth |
| Save onboarding step | Complete | `POST /api/v1/onboarding/step`, saves and returns safe draft state |
| Complete onboarding | Complete | `POST /api/v1/onboarding/complete`, upserts profile/onboarding completion |
| Target calculation | Complete | Deterministic backend calorie/protein calculation; no AI used |
| First-win options | Complete | Returns `UPDATE_WEIGHT`, `LOG_FIRST_MEAL`, `LOG_WATER`, `OPEN_DASHBOARD` |
| Onboarding validation | Complete | Latest lint, build, unit, and e2e tests passed |
| WeightLog schema | Complete | Added `WeightLog`, `WeightLogSource`, and `User.weightLogs` relation |
| WeightLog migration | Complete | Migration `20260706072703_weight_log` applied |
| WeightLog indexes | Complete | Added `userId`, `loggedAt`, and `userId + loggedAt` indexes |
| WeightLog create API | Complete | `POST /api/v1/logs/weight`, protected by JWT auth, current user only |
| WeightLog list API | Complete | `GET /api/v1/logs/weight`, protected by JWT auth, current user only |
| WeightLog validation | Complete | Latest lint, build, unit, and e2e tests passed |
| Git ignore for logs source | Complete | `.gitignore` changed from `logs` to `/logs` so `src/logs` is tracked |
| WaterLog schema | Complete | Added `WaterLog`, `WaterLogSource`, and `User.waterLogs` relation |
| WaterLog migration | Complete | Migration `20260706074733_water_log` applied |
| WaterLog indexes | Complete | Added `userId`, `loggedAt`, and `userId + loggedAt` indexes |
| WaterLog create API | Complete | `POST /api/v1/logs/water`, protected by JWT auth, current user only |
| WaterLog list API | Complete | `GET /api/v1/logs/water`, protected by JWT auth, current user only |
| WaterLog validation | Complete | Latest lint, build, unit, and e2e tests passed |
| ExerciseLog schema | Complete | Added `ExerciseLog`, `ExerciseLogSource`, `ExerciseType`, and `User.exerciseLogs` relation |
| ExerciseLog migration | Complete | Migration `20260706114403_exercise_log` applied |
| ExerciseLog indexes | Complete | Added `userId`, `loggedAt`, and `userId + loggedAt` indexes |
| Logs module | Complete | WeightLog, WaterLog, ExerciseLog, and MealLog implemented |
| ExerciseLog create API | Complete | `POST /api/v1/logs/exercise`, protected by JWT auth, current user only |
| ExerciseLog list API | Complete | `GET /api/v1/logs/exercise`, protected by JWT auth, current user only; supports `exerciseType` filter |
| ExerciseLog distance serialization | Complete | `distanceKm` Decimal is returned as a plain number |
| ExerciseLog validation | Complete | Latest lint, build, unit, and e2e tests passed |
| MealLog schema | Complete | Added `MealLog`, `MealLogItem`, meal enums, `ConfidenceLevel`, and `User.mealLogs` relation |
| MealLog migration | Complete | Migration `20260706123309_meal_log` applied |
| MealLog indexes | Complete | Added `MealLog` indexes for `userId`, `loggedAt`, `mealType`, `userId + loggedAt`; added `MealLogItem.mealLogId` index |
| MealLog create API | Complete | `POST /api/v1/logs/meals`, protected by JWT auth, current user only |
| MealLog list API | Complete | `GET /api/v1/logs/meals`, protected by JWT auth, current user only |
| MealLog detail API | Complete | `GET /api/v1/logs/meals/:id`, ownership enforced |
| MealLog update API | Complete | `PATCH /api/v1/logs/meals/:id`, ownership enforced, supports field updates and item replacement with recalculated totals |
| MealLog delete API | Complete | `DELETE /api/v1/logs/meals/:id`, ownership enforced, hard delete for MVP |
| MealLog item responses | Complete | `MealLogItem` rows are created and returned correctly |
| MealLog decimal serialization | Complete | Decimal-backed totals and item fields are returned as plain numbers |
| MealLog validation | Complete | Latest lint, build, unit, and e2e tests passed |
| Postman manual verification | Complete | Developer manually verified implemented APIs with Postman |
| Dashboard module | Complete | Dashboard Tasks 9.2-9.3 implemented |
| Dashboard today API | Complete | `GET /api/v1/dashboard/today`, protected by JWT auth, current user only |
| Dashboard today aggregation | Complete | Aggregates `UserProfile`, `WeightLog`, `MealLog`, `WaterLog`, and `ExerciseLog` data |
| Dashboard summary API | Complete | `GET /api/v1/dashboard/summary`, protected by JWT auth, current user only |
| Dashboard summary ranges | Complete | Supports `range=7d`, `range=30d`, `range=90d`; defaults to `7d`; invalid range returns `400` |
| Dashboard timezone handling | Complete | Uses `UserProfile.timezone` or fallback `Asia/Karachi`; local boundaries converted to UTC for Prisma queries |
| Dashboard placeholders | Complete | Deterministic `aiFocus`; `weeklyReview` and `rewardsPreview` placeholders; no AI call |
| Dashboard decimal serialization | Complete | Decimal-backed values are returned as plain numbers |
| Dashboard validation | Complete | Latest lint, build, unit, and e2e tests passed |
| Auth session validation | Complete | Latest lint, build, unit tests, and e2e tests passed; first parallel run had Argon2 timeout pressure but sequential reruns passed |
| AI config | Complete | Gemini primary provider; local/dev fallback when AI disabled or key missing; production requires key when enabled |
| AI persistence schema | Complete | Added `AiConversation`, `AiMessage`, `AiMealEstimate`, and AI enums |
| AI migration | Complete | Migration `20260707071051_ai_chat_foundation` applied |
| AI Chat API | Complete | `POST /api/v1/ai/chat`, protected by JWT auth, saves conversation/messages |
| AI Meal Estimate API | Complete | `POST /api/v1/ai/meal-estimate`, protected by JWT auth, uses Gemini structured output and does not create MealLog |
| AI Meal Confirm API | Complete | `POST /api/v1/ai/meal-confirm`, protected by JWT auth, creates `MealLog` with `AI_CHAT` source |
| AI Conversations APIs | Complete | `GET /api/v1/ai/conversations`, `GET /api/v1/ai/conversations/:id`, `DELETE /api/v1/ai/conversations/:id` |
| AI safety guardrails | Complete | Blocks unsafe dieting, eating disorder, self-harm, and medication dosing prompts |
| AI validation | Complete | Lint, build, unit tests, e2e tests, and Prisma migrate status passed |

## Not Started

| Feature | Status | Notes |
|---|---|---|
| Refresh token rotation | Not started | Future auth hardening task; explicitly deferred in Task 10.1 |
| Google OAuth | Not started | Future auth implementation task |
| Password reset | Not started | Future auth implementation task |
| Email verification | Not started | Future auth implementation task |
| Rate limiting/brute-force protection | Not started | Future security hardening before public beta |
| Security headers / Helmet | Not started | Future public-beta hardening if not already implemented |
| Production CORS allowlist verification | Not started | Future deployment hardening |
| WhatsApp webhook | Not started | Future task |
| Admin modules | Not started | Future task |
