# Phoenix Backend

NestJS API boilerplate for Project Phoenix. This repository is independent and is not part of a monorepo.

## Stack

- NestJS
- TypeScript
- Express
- Swagger/OpenAPI
- Centralized config validation

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
npm install
cp .env.example .env
```

Update `.env` with local values as needed.

## Run

```bash
# Development
npm run start:dev

# Production build
npm run build
npm run start:prod
```

Default URL: `http://localhost:4000`

Health check: `GET http://localhost:4000/api/v1/health`

Swagger docs are available in development at:

```text
http://localhost:4000/api/docs
```

## Project structure

```text
src/
  common/     # Shared responses, filters, interceptors
  config/     # Environment validation
  health/     # Health check module
  app.module.ts
  main.ts
```

## Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Start with watch mode |
| `npm run build` | Compile TypeScript |
| `npm run start:prod` | Run compiled app |
| `npm run test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run lint` | ESLint |

## Environment

Copy `.env.example` to `.env`. Never commit `.env`.

Required variables:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `GEMINI_API_KEY`

Optional variables:

- `RESEND_API_KEY`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `CORS_ORIGINS`

See `DEVELOPMENT_LOG.md` for setup history and intentional exclusions.
