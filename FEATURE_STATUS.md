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
| Login API | Complete in code | `POST /api/v1/auth/login` |
| JWT access token signing | Complete in code | 15 minute access token expiry from env |
| Refresh token creation | Complete in code | Opaque random token, SHA-256 hash stored only |
| Multi-device login | Complete in code | One `RefreshToken` row per successful login |
| RefreshToken deviceType schema | Migration file created; DB apply blocked | `prisma migrate dev` fails with Prisma schema engine error against Supabase |

## Not Started

| Feature | Status | Notes |
|---|---|---|
| Refresh endpoint | Not started | Explicitly out of scope for Task 3.3 |
| Token rotation | Not started | Explicitly out of scope for Task 3.3 |
| Auth guards/protected routes | Not started | Explicitly out of scope for Task 3.3 |
| Logout API | Not started | Future auth implementation task |
| Google OAuth | Not started | Future auth implementation task |
| Password reset | Not started | Future auth implementation task |
| Email verification | Not started | Future auth implementation task |
| User profile/product models | Not started | Future schema task |
| AI provider logic | Not started | Future task |
| WhatsApp webhook | Not started | Future task |
| Admin modules | Not started | Future task |
