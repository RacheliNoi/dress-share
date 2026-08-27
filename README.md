# DressShare

A full-stack dress rental marketplace. Dress owners list items for rent; renters browse an approved public catalog, check real-time availability, and book by date range and size. Built end-to-end (schema, API, auth, business logic, UI) as an independent project.

**Stack:** NestJS · Prisma · PostgreSQL · Next.js (App Router) · React · TypeScript · Tailwind CSS

UI is in Hebrew with full RTL support.

## Features

**Catalog**
- Server-side search, filtering (category, color, size, price range) and sorting
- Server-side pagination (`page`/`limit`, with total match count)
- Availability-by-date filtering, layered on top of the paginated results

**Listings**
- Full lifecycle: draft → pending approval → approved / rejected, with admin review
- Editing an already-approved listing doesn't affect what's publicly visible until an admin approves the edit — proposed changes are held in a separate "pending" shadow (`pendingDetails`, `pendingAction: ADD/REMOVE` on sizes/photos) rather than mutating the live row
- Per-size inventory (multiple physical units per size), photo management

**Bookings**
- Per-size, quantity-aware capacity tracking (not just whole-dress blocking)
- Overlapping date-range validation
- Concurrency-safe: capacity checks and inserts run inside a Postgres `SERIALIZABLE` transaction with automatic retry, so two simultaneous requests for the last unit of a size can't both succeed

**Auth & authorization**
- JWT-based authentication, role-based access control (`USER` / `ADMIN`)
- Server-side ownership checks on every mutating endpoint — never trusts a client-supplied owner/role claim

**Admin**
- Review queue for pending listings and pending edits, with approve/reject + rejection reason

## Tech stack

| | |
|---|---|
| **Backend** | NestJS, TypeScript, Prisma ORM, PostgreSQL |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| **Auth** | JWT (`@nestjs/jwt`), bcrypt |
| **Testing** | Jest + Supertest (unit/integration), Playwright (browser verification) |

## Project structure

```
apps/
  api/    NestJS backend (REST API, Prisma schema & migrations)
  web/    Next.js frontend
docker-compose.yml   Local PostgreSQL
```

There's no root workspace config — each app is installed and run independently.

## Getting started

**Prerequisites:** Node.js 20+, Docker (for local Postgres) or an existing PostgreSQL instance.

```bash
# 1. Start Postgres
docker compose up -d

# 2. Backend
cd apps/api
npm install
cp .env.example .env   # set DATABASE_URL and JWT_SECRET
npx prisma migrate dev
npm run db:seed        # creates a seeded admin user, see below
npm run start:dev      # http://localhost:3001

# 3. Frontend (separate terminal)
cd apps/web
npm install
npm run dev             # http://localhost:3000
```

### Environment variables

| App | Variable | Notes |
|---|---|---|
| `apps/api` | `DATABASE_URL` | PostgreSQL connection string |
| `apps/api` | `JWT_SECRET` | Secret used to sign auth tokens |
| `apps/api` | `PORT` | Optional, defaults to `3001` |
| `apps/web` | `NEXT_PUBLIC_API_URL` | Optional, defaults to `http://localhost:3001` |

### Default seeded admin (local dev only)

```
admin@dressshare.local / Admin123!dev
```

Change this before deploying anywhere reachable outside your own machine.

## Testing

```bash
cd apps/api
npm test            # unit + integration (Jest, Supertest)
npm run test:cov    # with coverage
```

## Notable design decisions

- **Ownership enforced in the service layer, not just guarded routes.** Every mutation re-fetches the resource and checks `ownerId` before writing — a missing route guard alone would never be enough to leak data.
- **Approve-in-place editing.** Rather than a separate "draft" table, an approved listing's proposed edits live on the same row (`pendingDetails` JSON + `pendingAction` on child rows), so the public read path never has to branch on edit state — it simply never selects the pending fields.
- **Price sort vs. pagination.** Prisma can't order a query by an aggregate (min price) across a to-many relation, so `recommended`/`newest` paginate at the database level, while price-sorted queries fetch all matches, sort in application code, and slice — trading one code path's efficiency for correctness rather than reaching for raw SQL.
