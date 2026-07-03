# Pending Issues

## Open

- npm reported 5 high severity audit findings after installing foundation packages. No audit fix was run because dependency remediation can broaden package changes and should be handled as a separate maintenance task.
- npm reported an engine warning for an ESLint transitive dependency because the current Node runtime is `v22.0.0`; the package expects `^20.19.0 || ^22.13.0 || >=24`.
- Prisma 7 could not be installed on the current Node runtime (`v22.0.0`) because it requires Node `20.19+`, `22.12+`, or `24+`. Prisma was pinned to `6.19.3` for compatibility.
- npm reported the same 5 high severity audit findings and same ESLint transitive engine warning after installing `argon2`.

## Deferred By Scope

- JWT token issuance and refresh token creation are intentionally deferred; Task 3.2 creates a signup user only.
- Login, logout, Google OAuth, password reset, and email verification are intentionally deferred.
- User profile fields such as timezone and language preference are intentionally deferred.
- Product Prisma models are intentionally deferred.
- AI provider, WhatsApp webhook, admin, and business modules are intentionally deferred.
