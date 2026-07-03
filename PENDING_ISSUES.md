# Pending Issues

## Open

- npm reported 5 high severity audit findings after installing foundation packages. No audit fix was run because dependency remediation can broaden package changes and should be handled as a separate maintenance task.
- npm reported an engine warning for an ESLint transitive dependency because the current Node runtime is `v22.0.0`; the package expects `^20.19.0 || ^22.13.0 || >=24`.

## Deferred By Scope

- Prisma/database connection is intentionally deferred.
- Auth/JWT flows are intentionally deferred; secrets are validated now for future auth readiness.
- AI provider, WhatsApp webhook, admin, and business modules are intentionally deferred.
