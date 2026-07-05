# Pending Issues

## Open

- npm reported 5 high severity audit findings after installing foundation packages. No audit fix was run because dependency remediation can broaden package changes and should be handled as a separate maintenance task.
- npm reported an engine warning for an ESLint transitive dependency because the current Node runtime is `v22.0.0`; the package expects `^20.19.0 || ^22.13.0 || >=24`.
- Prisma 7 could not be installed on the current Node runtime (`v22.0.0`) because it requires Node `20.19+`, `22.12+`, or `24+`. Prisma was pinned to `6.19.3` for compatibility.
- npm reported the same 5 high severity audit findings and same ESLint transitive engine warning after installing `argon2`.
- npm reported the same 5 high severity audit findings and same ESLint transitive engine warning after installing `@nestjs/jwt`.

## Resolved

- The Auth Task 3.3 Prisma migration issue was resolved by using the Supabase Session Pooler connection string from `.env`.
- Migration `20260705170000_auth_3_3_login_device_type` is applied.
- `npx prisma migrate status` reports the database schema is up to date.
- Auth Task 3.3 validation passed:
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run test:e2e`
- User/Profile Tasks 4.1-4.4 are complete:
  - JWT Auth Guard and `@CurrentUser()` decorator
  - `GET /api/v1/me`
  - `PATCH /api/v1/me/profile`
  - `PATCH /api/v1/me/password`
- User/Profile Tasks 4.1-4.4 validation passed:
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run test:e2e`

## Deferred By Scope

- Refresh endpoint, token rotation, logout, Google OAuth, password reset, and email verification are intentionally deferred.
- Rate limiting/brute-force protection is intentionally deferred as future security hardening before public beta.
- A separate UserProfile model is intentionally deferred unless onboarding/personalization requires fields like timezone or preferredLanguage.
- Product Prisma models are intentionally deferred.
- AI provider, WhatsApp webhook, admin, and business modules are intentionally deferred.
