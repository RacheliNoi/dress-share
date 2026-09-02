# DressShare

A full-stack dress rental marketplace. Dress owners list items for rent; renters browse an approved public catalog, check real-time availability, and book by date range and size. Built end-to-end (schema, API, auth, business logic, UI) as an independent project.

**Stack:** NestJS · Prisma · PostgreSQL · Next.js (App Router) · React · TypeScript · Tailwind CSS

UI is in Hebrew with full RTL support.

## Features

**Catalog**
- Server-side search, filtering (category, color, size, price range) and sorting
- Server-side pagination (`page`/`limit`, with total match count)
- Availability-by-date filtering, layered on top of the paginated results
- Downloadable PDF catalog (`/catalog-pdf`) via the browser's own print-to-PDF, listing every approved dress with a real clickable link to its page — for anyone who can browse the images offline but can't reach the live site to click through directly

**Listings**
- Full lifecycle: draft → pending approval → approved / rejected, with admin review
- Editing an already-approved listing doesn't affect what's publicly visible until an admin approves the edit — proposed changes are held in a separate "pending" shadow (`pendingDetails`, `pendingAction: ADD/REMOVE` on sizes/photos) rather than mutating the live row
- Per-size inventory (multiple physical units per size)
- Every uploaded photo is automatically enhanced via the Photoroom API (clean warm-neutral studio background, subject never altered) — falls back to the original upload untouched if the enhancement call fails or isn't configured
- Owners can manually re-run the enhancement on any one photo if they don't like the automatic result, without losing the original upload

**Bookings**
- Renter-initiated: any logged-in user (not the dress's owner) can mark interest in a dress from its public page — the owner responds and confirms, rather than self-reporting a rental, which closes off the obvious way to dodge commission by arranging a deal outside the platform
- Per-size, quantity-aware capacity tracking (not just whole-dress blocking)
- Overlapping date-range validation
- Concurrency-safe: capacity checks and inserts run inside a Postgres `SERIALIZABLE` transaction with automatic retry, so two simultaneous requests for the last unit of a size can't both succeed
- Stale `INTERESTED` holds that never convert to a confirmed rental auto-expire after 7 days (scheduled job, also runs once on startup so a restart doesn't wait for the next midnight run) and release their date/size back into the calendar
- Owners can block off date ranges for their own reasons (cleaning, personal use) without creating a fake booking — a separate `DressAvailabilityBlock`, folded into the same public availability feed the calendar reads
- In-app chat per booking (simple polling, not WebSockets), shared by one component on both the renter's and owner's screens, so fitting/logistics coordination stays on-platform instead of pushing people to WhatsApp before a booking is real

**Renter-facing UI**
- "מעוניינת בהשכרה" (interested in renting) action on the public dress page, gated to logged-in non-owners
- "הבקשות שלי" (my requests) page listing everything the current user has booked as a renter, with the same chat thread as the owner sees

**Owner-facing UI**
- Incoming-requests panel (real renter-initiated bookings only — no manual "create a booking for a customer" form, which would bypass the same-platform requirement above) with reply/chat and rent-confirmation
- Separate date-blocking panel, independent of the booking flow

**Notifications**
- Owner gets notified when someone expresses interest in their dress; whichever side of a chat didn't just write gets notified of a new message; a renter gets warned once before their `INTERESTED` hold is about to auto-expire
- Real email delivery via Resend. Until a sending domain is verified in the Resend dashboard, real recipient addresses are rejected by Resend itself (their anti-spam safeguard) and every send falls back to the same `[dev-only]` console log used before — nothing breaks, emails just aren't delivered to real inboxes yet
- Routed through a single `NotificationsService.send()` choke point — the eventual domain-verified `from` address change, or any future provider swap, touches one method, not each trigger site

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
| `apps/api` | `FRONTEND_URL` | Optional. Allowed CORS origin, defaults to `http://localhost:3000` — set to the real frontend URL on deploy |
| `apps/api` | `PHOTOROOM_API_KEY_SANDBOX` | Optional. Photo enhancement on upload — free tier, output is watermarked. Uploads work fine without it (skips enhancement, keeps the original photo only) |
| `apps/api` | `PHOTOROOM_API_KEY_LIVE` | Optional, not currently wired to any code path — reserved for switching off the sandbox watermark before shipping |
| `apps/api` | `RESEND_API_KEY` | Optional. Real email delivery. Without a verified sending domain, real recipients get rejected by Resend and notifications fall back to a console log |
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
- **Renter-initiated bookings, not owner self-report.** Earlier in the project's life, only the dress's owner could create a booking record (including marking it `INTERESTED`), which meant nothing stopped an owner from just arranging a rental off-platform and never touching the app at all. The fix wasn't a policy — it was making the renter the one who creates the `INTERESTED` row, with the owner responding rather than reporting, so the interaction actually has to happen on the platform to exist at all.
- **One notification choke point.** Every outbound email goes through a single `NotificationsService.send()`, which calls the real Resend API and falls back to a console log if that call fails or isn't configured (mirroring the existing password-reset placeholder). Every trigger site calls a named method on that service, never a provider directly, so the eventual "real domain verified, remove the fallback" change is one-file.
