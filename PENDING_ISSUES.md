# Pending Issues

## Open

- npm reported 5 high severity audit findings after installing foundation packages. No audit fix was run because dependency remediation can broaden package changes and should be handled as a separate maintenance task.
- npm reported an engine warning for an ESLint transitive dependency because the current Node runtime is `v22.0.0`; the package expects `^20.19.0 || ^22.13.0 || >=24`.
- Prisma 7 could not be installed on the current Node runtime (`v22.0.0`) because it requires Node `20.19+`, `22.12+`, or `24+`. Prisma was pinned to `6.19.3` for compatibility.
- npm reported the same 5 high severity audit findings and same ESLint transitive engine warning after installing `argon2`.
- npm reported the same 5 high severity audit findings and same ESLint transitive engine warning after installing `@nestjs/jwt`.
- `npx prisma migrate dev --name auth_3_3_login_device_type` failed with `Error: Schema engine error:` while targeting Supabase PostgreSQL at the configured database host. `npx prisma validate` and `npx prisma generate` passed, and migration SQL was created in source, but the live database migration was not applied from this environment.

## Deferred By Scope

- Refresh endpoint, token rotation, logout, auth guards, protected routes, Google OAuth, password reset, and email verification are intentionally deferred.
- User profile fields such as timezone and language preference are intentionally deferred.
- Product Prisma models are intentionally deferred.
- AI provider, WhatsApp webhook, admin, and business modules are intentionally deferred.
