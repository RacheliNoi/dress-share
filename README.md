# DressShare

A full-stack dress rental marketplace. Dress owners list items for rent; renters browse an approved public catalog, check real-time availability, and book by date range and size. Built end-to-end (schema, API, auth, business logic, UI) as an independent project.

**Stack:** NestJS · Prisma · PostgreSQL · Next.js (App Router) · React · TypeScript · Tailwind CSS

UI is in Hebrew with full RTL support.

## Features

**Catalog**
- Server-side search, filtering (category, color, city, size, price range) and sorting
- Server-side pagination (`page`/`limit`, with total match count)
- Availability-by-date filtering, layered on top of the paginated results
- Downloadable PDF catalog (`/catalog-pdf`) via the browser's own print-to-PDF, listing every approved dress with a real clickable link to its page — for anyone who can browse the images offline but can't reach the live site to click through directly

**Listings**
- Full lifecycle: draft → pending approval → approved / rejected, with admin review
- Editing an already-approved listing doesn't affect what's publicly visible until an admin approves the edit — proposed changes are held in a separate "pending" shadow (`pendingDetails`, `pendingAction: ADD/REMOVE` on sizes/photos) rather than mutating the live row
- Per-size inventory (multiple physical units per size)
- City (owner-set, searchable/filterable like category and color)
- View count on the public dress page — a fire-and-forget counter bumped once per page load, visible to the owner too
- Every uploaded photo gets two independent, optional enhancement passes, each falling back to leaving the photo untouched if it doesn't apply or fails:
  - **Backdrop replacement** — for a dress photographed on a hanger against a plain, evenly lit backdrop, the backdrop is swapped for a clean studio tone. Fully local (no AI, no external service, no cost, no volume limit) — works by sampling the photo's border color and keying out anything close to it.
  - **Face blurring** — any detected face is blurred, protecting the privacy of whoever is wearing the dress. Detected for free by a local model (BlazeFace, via TensorFlow.js) that runs entirely on the server — no API key, no billing, no per-photo cost. Falls back to Google Cloud Vision only if the local model finds nothing (kept as an optional, more accurate upgrade path; requires billing enabled on the Google Cloud project, skipped entirely if not configured).
- Owners can click any photo to open a large preview with a before/after toggle and re-run the AI enhancement as many times as they want, without losing the original upload

**Bookings**
- Renter-initiated: any logged-in user (not the dress's owner) can mark interest in a dress from its public page — the owner responds and confirms, rather than self-reporting a rental, which closes off the obvious way to dodge commission by arranging a deal outside the platform
- Per-size, quantity-aware capacity tracking (not just whole-dress blocking)
- Overlapping date-range validation
- Concurrency-safe: capacity checks and inserts run inside a Postgres `SERIALIZABLE` transaction with automatic retry, so two simultaneous requests for the last unit of a size can't both succeed
- Stale `INTERESTED` holds that never convert to a confirmed rental auto-expire after 7 days (scheduled job, also runs once on startup so a restart doesn't wait for the next midnight run) and release their date/size back into the calendar
- Owners can block off date ranges for their own reasons (cleaning, personal use) without creating a fake booking — a separate `DressAvailabilityBlock`, folded into the same public availability feed the calendar reads
- In-app chat per booking (simple polling, not WebSockets), shared by one component on both the renter's and owner's screens, so fitting/logistics coordination stays on-platform instead of pushing people to WhatsApp before a booking is real

**Renter-facing UI**
- "מעוניינת בהשכרה" (interested in renting) action on the public dress page, gated to logged-in non-owners — supports picking multiple sizes and multiple units of the same size in one request, respecting each size's real remaining capacity. Size picking is gated behind choosing dates first (capacity is meaningless without a date range), and availability re-fetches on every date change and after a successful submission
- "הבקשות שלי" (my requests) page listing everything the current user has booked as a renter, with the same chat thread as the owner sees

**Owner-facing UI**
- Incoming-requests panel (real renter-initiated bookings only — no manual "create a booking for a customer" form, which would bypass the same-platform requirement above) with reply/chat and rent-confirmation
- Separate date-blocking panel, independent of the booking flow

**Notifications**
- Owner gets notified when someone expresses interest in their dress; whichever side of a chat didn't just write gets notified of a new message; a renter gets warned once before their `INTERESTED` hold is about to auto-expire
- Real email delivery via Resend, rendered through a branded HTML template matching the site's own colors/RTL layout with real button-style links. Until a sending domain is verified in the Resend dashboard, real recipient addresses are rejected by Resend itself (their anti-spam safeguard) and every send falls back to the same `[dev-only]` console log used before — nothing breaks, emails just aren't delivered to real inboxes yet
- Routed through a single `NotificationsService.send()` choke point — the eventual domain-verified `from` address change, or any future provider swap, touches one method, not each trigger site

**Auth & authorization**
- JWT-based authentication, role-based access control (`USER` / `ADMIN`)
- Server-side ownership checks on every mutating endpoint — never trusts a client-supplied owner/role claim
- Rate-limited (5 requests/minute per IP) on every `/auth` route — blocks brute-force login/credential-stuffing and registration/reset-email spam

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
| `apps/api` | `GOOGLE_VISION_API_KEY` | Optional. Face blurring works for free without this (local BlazeFace model) — this only adds a Cloud Vision fallback for photos the local model misses. Requires billing enabled on the Google Cloud project |
| `apps/api` | `RESEND_API_KEY` | Optional. Real email delivery. Without a verified sending domain, real recipients get rejected by Resend and notifications fall back to a console log |
| `apps/api` | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Optional. Dress photo storage on Cloudflare R2. Without these (or if R2 is unreachable), uploads fall back to local disk under `apps/api/uploads` automatically — the app works fine either way |
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

## Deployment

- **Frontend (`apps/web`):** Vercel, with the project's root directory set to `apps/web`. Set `NEXT_PUBLIC_API_URL` to the deployed API's URL.
- **Backend (`apps/api`) + database:** Railway (or any Node host + managed Postgres), with the service's root directory set to `apps/api`. Build command `npm run build`, start command `npm run start:prod` — this runs `prisma migrate deploy` before starting, so migrations apply automatically on every deploy. Set every variable from the [environment variables](#environment-variables) table above, especially a real (non-default) `JWT_SECRET`, `DATABASE_URL` pointing at the production Postgres instance, and `FRONTEND_URL` pointing at the deployed frontend.
- **Photo storage:** once R2 credentials are set and reachable in production, uploads go straight to R2 — the local-disk fallback (`apps/api/uploads`) is a dev-environment safety net, not meant to hold real production photos long-term, since most Node hosts (Railway included) wipe the local filesystem on every redeploy.
- Do not carry over the local dev Postgres database. Point production at a fresh database and let `prisma migrate deploy` build the schema; the seeded dev admin (`admin@dressshare.local`) is for local dev only, per the environment variables section above.

## Notable design decisions

- **Ownership enforced in the service layer, not just guarded routes.** Every mutation re-fetches the resource and checks `ownerId` before writing — a missing route guard alone would never be enough to leak data.
- **Approve-in-place editing.** Rather than a separate "draft" table, an approved listing's proposed edits live on the same row (`pendingDetails` JSON + `pendingAction` on child rows), so the public read path never has to branch on edit state — it simply never selects the pending fields.
- **Price sort vs. pagination.** Prisma can't order a query by an aggregate (min price) across a to-many relation, so `recommended`/`newest` paginate at the database level, while price-sorted queries fetch all matches, sort in application code, and slice — trading one code path's efficiency for correctness rather than reaching for raw SQL.
- **Renter-initiated bookings, not owner self-report.** Earlier in the project's life, only the dress's owner could create a booking record (including marking it `INTERESTED`), which meant nothing stopped an owner from just arranging a rental off-platform and never touching the app at all. The fix wasn't a policy — it was making the renter the one who creates the `INTERESTED` row, with the owner responding rather than reporting, so the interaction actually has to happen on the platform to exist at all.
- **One notification choke point.** Every outbound email — including password reset — goes through a single `NotificationsService.send()`, which calls the real Resend API and falls back to a console log if that call fails or isn't configured. Every trigger site calls a named method on that service, never a provider directly, so the eventual "real domain verified, remove the fallback" change is one-file.
