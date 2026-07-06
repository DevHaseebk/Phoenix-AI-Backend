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
| Logs module | Partial | Weight logs implemented only |
| WeightLog create API | Complete | `POST /api/v1/logs/weight`, protected by JWT auth, current user only |
| WeightLog list API | Complete | `GET /api/v1/logs/weight`, protected by JWT auth, current user only |
| WeightLog validation | Complete | Latest lint, build, unit, and e2e tests passed |
| Git ignore for logs source | Complete | `.gitignore` changed from `logs` to `/logs` so `src/logs` is tracked |

## Not Started

| Feature | Status | Notes |
|---|---|---|
| Refresh endpoint | Not started | Explicitly out of scope for Task 3.3 |
| Token rotation | Not started | Explicitly out of scope for Task 3.3 |
| Logout API | Not started | Future auth implementation task |
| Google OAuth | Not started | Future auth implementation task |
| Password reset | Not started | Future auth implementation task |
| Email verification | Not started | Future auth implementation task |
| Rate limiting/brute-force protection | Not started | Future security hardening before public beta |
| Dashboard module | Not started | Future MVP module |
| WaterLog model/API | Not started | Future core logs task |
| ExerciseLog model/API | Not started | Future core logs task |
| MealLog model/API | Not started | Future core logs task |
| AI provider logic | Not started | Future task |
| WhatsApp webhook | Not started | Future task |
| Admin modules | Not started | Future task |
