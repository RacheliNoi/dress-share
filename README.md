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
- Returning to the catalog (or favorites, or the owner's own "my dresses" list) from a dress page via its "back" button restores the exact scroll position (and, on the catalog, pagination page and active filters/sort/search too) instead of jumping back to the top — a `router.back()` real history pop, paired with an in-memory cache of the last fetched results (and view state, on the catalog) so the grid re-renders at full height on the same page instantly instead of flashing an empty loading skeleton first (which would otherwise cut the browser's own scroll restoration short)
- "איך זה עובד" (how it works) section below the grid — four numbered steps from browsing to renting, revealed with a staggered scroll-in animation the first time it enters the viewport, with a small bouncing arrow under the title bar that smooth-scrolls straight to it, and a "back to top" button that appears once scrolled that far back down the other way

**Marketing**
- A standalone, animated "story"-format promo page at `/promo.html` (`apps/web/public/promo.html`) — a self-contained static file (own HTML/CSS/JS, no dependency on the rest of the app or any external account) meant to be shared directly for real distribution. Payment-by-credit-card is explicitly marked "coming soon" there, since it isn't live yet.
- Per-dress Open Graph/Twitter Card metadata — sharing a specific dress's link shows that dress's own name, city/category, and photo, not the site's generic brand card. `app/dress/[id]/page.tsx` is a real Server Component with a `generateMetadata` that fetches server-side (crawlers never run the client-side fetch the page content itself uses) against a dedicated single-dress endpoint (`GET /dresses/approved/:id`) rather than the paginated catalog list
- A dismissible announcement bar above the header on the catalog page advertising the free launch period, with a CTA straight to registration (or the new-listing wizard, if already logged in) — dismissal is remembered per-browser (`localStorage`) so it doesn't nag a returning visitor
- A floating "משוב" (feedback) button, visible to any logged-in user on every page, opening a small form to send free-text suggestions/bug reports straight to the admin feedback inbox

**Listings**
- Full lifecycle: draft → pending approval → approved / rejected, with admin review
- Owners can permanently delete a dress they've listed — including an already-approved one, for cleaning up old/irrelevant listings — as long as it never had a real (priced) booking; a dress with real rental history is blocked from deletion instead, since that would silently take its bookings/reviews down with it. Uploaded photo files are cleaned up along with the row
- Photo upload (both the initial listing flow and later edits) shows a standing notice asking owners to photograph the dress on a hanger, not worn — keeps photos accessible to visitors behind content filters that block images of people
- The commission-fee note and the admin-approval requirement are surfaced inline where they're actually relevant (an info tooltip next to the price field, and existing copy next to the "send for approval" action) rather than as a one-time popup after login/register
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
- In-app chat per booking (simple polling, not WebSockets), shared by one component on both the renter's and owner's screens, so fitting/logistics coordination stays on-platform instead of pushing people to WhatsApp before a booking is real — a standing notice above every chat asks both sides to keep messages to logistics (dates, sizes, handoff) and that conversations may be reviewed
- Star ratings & reviews — once a `RENTED` booking's end date has passed, the renter can leave a 1-5 star rating and an optional comment from "הבקשות שלי" (one review per booking, enforced by a unique constraint). A dress's `averageRating`/`reviewCount` are denormalized onto the `Dress` row itself (recomputed via aggregate whenever a review is created), so the rating shown on every catalog card, and the reviews list on the dress's own page, never costs a join or a live aggregate on a normal page view

**Renter-facing UI**
- "מעוניינת בהשכרה" (interested in renting) action on the public dress page, gated to logged-in non-owners — supports picking multiple sizes and multiple units of the same size in one request, respecting each size's real remaining capacity. Size picking is gated behind choosing dates first (capacity is meaningless without a date range), and availability re-fetches on every date change and after a successful submission
- "הבקשות שלי" (my requests) page listing everything the current user has booked as a renter, with the same chat thread as the owner sees
- Favoriting — a heart toggle on each catalog card for logged-in users (redirects to login otherwise), backed by a `Favorite` join table (one row per user/dress pair, idempotent add/remove); a "מועדפים" page lists everything favorited, with the same card and unfavorite-to-remove interaction

**Owner-facing UI**
- Incoming-requests panel (real renter-initiated bookings only — no manual "create a booking for a customer" form, which would bypass the same-platform requirement above) with reply/chat and rent-confirmation
- Separate date-blocking panel, independent of the booking flow

**Notifications**
- Owner gets notified when someone expresses interest in their dress; whichever side of a chat didn't just write gets notified of a new message; a renter gets warned once before their `INTERESTED` hold is about to auto-expire
- Real email delivery via Resend, rendered through a branded HTML template matching the site's own colors/RTL layout with real button-style links. Until a sending domain is verified in the Resend dashboard, real recipient addresses are rejected by Resend itself (their anti-spam safeguard) and every send falls back to the same `[dev-only]` console log used before — nothing breaks, emails just aren't delivered to real inboxes yet
- Routed through a single `NotificationsService.send()` choke point — the eventual domain-verified `from` address change, or any future provider swap, touches one method, not each trigger site

**Auth & authorization**
- JWT-based authentication, role-based access control (`USER` / `ADMIN`) — the API refuses to start without a `JWT_SECRET` env var (no insecure hardcoded fallback)
- Server-side ownership checks on every mutating endpoint — never trusts a client-supplied owner/role claim
- Password strength enforced server-side (min 8 characters, at least one letter and one digit) on register, password change, and password reset alike
- Rate-limited (5 requests/minute per IP) on every `/auth` route, and on feedback/review submission and dress photo upload — blocks brute-force login/credential-stuffing, registration/reset-email spam, and repeated hits on the CPU-heavy photo-processing pipeline
- Uploaded photos (dress listings and wardrobe items) are restricted to real image types (JPEG/PNG/WebP/GIF) and capped at 10MB per file — closes a stored-content and resource-exhaustion gap an unrestricted upload would otherwise leave open
- Login/register support a `?redirect=` target, resolved through the same URL parser the browser's own navigation uses and only trusted when it still resolves to this origin (rather than a naive string-prefix check, which a crafted value using stripped-by-the-parser control characters could bypass) — a logged-out visitor who tries to express interest in a dress lands back on that exact dress page after signing in, instead of the homepage; the login↔register cross-link carries the same param through so switching between them doesn't lose it

**Admin**
- Review queue for pending listings and pending edits, with approve/reject + rejection reason
- A feedback inbox (`/admin/feedback`) listing free-text suggestions/bug reports submitted by users, most recent first, with the sender's name/email, and a delete action per entry so handled/irrelevant feedback doesn't pile up indefinitely

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
| `apps/api` | `PUBLIC_APP_URL` | Optional. Base URL used inside real email links (password reset, etc.) only — separate from `FRONTEND_URL` so local dev can send real emails (via a real `RESEND_API_KEY`) with links pointing at the real production site instead of `localhost`. Falls back to `FRONTEND_URL`, so production never needs to set it |
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
