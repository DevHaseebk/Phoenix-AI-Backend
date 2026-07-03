# AI Handover

## Current State

Backend Foundation 2.2 is complete.

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
- Prisma readiness endpoint at `GET /api/v1/health/ready`.

Current Prisma schema contains only one non-product placeholder model:

- `FoundationMigrationCheck`

This exists only to verify migrations and should not be treated as an application domain model.

## Decisions Used

- D-028 REST APIs are MVP default.
- D-029 Swagger documentation required.
- D-031 Standard API response shape.
- D-020 MVP database is PostgreSQL.
- D-021 Prisma ORM is used.
- D-023 Supabase PostgreSQL is used initially.
- D-045 Backend deploys to Render or Railway.
- D-146 MVP is not medical diagnosis or treatment.
- D-150 Documentation first.

## Next Recommended Task

Auth foundation or first product Prisma schema migration, depending on the approved backend build order.

## Guardrails

- Do not add auth, users, AI, WhatsApp, admin, or business modules as part of this completed foundation task.
- Do not expand Prisma beyond the approved next schema task.
- Keep future work inside `backend` unless explicitly instructed otherwise.

## Prisma Notes

- Prisma CLI and Client are pinned to `6.19.3` because Prisma 7 requires a newer Node version than the current local runtime.
- Migration applied: `20260703125907_foundation_2_2_prisma_setup`.
