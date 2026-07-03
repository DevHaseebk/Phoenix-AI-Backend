# Pending Issues

## Open

- npm reported 5 high severity audit findings after installing foundation packages. No audit fix was run because dependency remediation can broaden package changes and should be handled as a separate maintenance task.
- npm reported an engine warning for an ESLint transitive dependency because the current Node runtime is `v22.0.0`; the package expects `^20.19.0 || ^22.13.0 || >=24`.
- Prisma 7 could not be installed on the current Node runtime (`v22.0.0`) because it requires Node `20.19+`, `22.12+`, or `24+`. Prisma was pinned to `6.19.3` for compatibility.

## Deferred By Scope

- Auth/JWT flows are intentionally deferred; secrets are validated now for future auth readiness.
- Product Prisma models are intentionally deferred.
- AI provider, WhatsApp webhook, admin, and business modules are intentionally deferred.
