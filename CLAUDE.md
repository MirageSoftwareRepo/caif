# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Stack**: TanStack Start (React 19, SSR) + TypeScript + Vite + Tailwind CSS v4 + Drizzle ORM + PostgreSQL 16 + better-auth + Radix UI
**Package Manager**: Bun (`bun.lock`, `bunfig.toml`) — never use `npm`/`pnpm`/`yarn` even though `package-lock.json` exists alongside `bun.lock`.

## Commands

```bash
bun dev               # docker compose up -d (PostgreSQL) then vite dev (port 8080)
bun build             # Production build (outputs dist/client + dist/server)
bun build:dev         # Vite build --mode development
bun preview           # vite preview (static client only — use start.js for SSR)
bun lint              # eslint . (run before commit)
bun format            # prettier --write .
bun test              # vitest run
bun test:watch        # vitest
bun docker:up         # docker compose up -d (PostgreSQL 16, port 5432)
bun docker:down       # docker compose down
bun db:push           # drizzle-kit push (CREATE/ALTER tables)
bun db:generate       # drizzle-kit generate (migrations to src/db/migrations/)
bun db:migrate        # drizzle-kit migrate
bun db:seed           # bun run src/db/seed.ts (8 specialties + admin user)
bun db:studio         # Drizzle Studio GUI
bunx vitest run src/lib/clinical-permissions.test.ts   # single test file
```

CI (`.github/workflows/ci.yml`): `bun run lint` → `bunx tsc --noEmit` → `bun run test` → `bun run build`, against a real `postgres:16` service container. Lint, Type Check, and Build are `continue-on-error: true` (non-blocking); **Unit Tests is not** — a failing test fails the CI job. There is no `typecheck` npm script — CI runs `tsc` directly. `run-tests.sh` / `run-tests.bat` run the same four steps locally and write results to `test/`.

## Architecture

- **Vite config**: `vite.config.ts` uses `@lovable.dev/vite-tanstack-config` which bundles tanstackStart, viteReact, tailwindcss, tsConfigPaths, and nitro build. Do NOT add these plugins manually.
- **Server entry**: `src/server.ts` launches the daily scheduler + wraps SSR with error capture. Exports `{ fetch() }` for the runtime.
- **App entry**: `src/start.ts` creates `startInstance` with middlewares for auth (`/api/auth/*`) and WhatsApp (`/api/whatsapp/*`, admin-only). NOT TanStack routes.
- **Routing**: File-based in `src/routes/` (see `src/routes/README.md` for conventions — bare `$id` for dynamic segments, `$.tsx`/`_splat` for splats, `__root.tsx` is the only root layout). `routeTree.gen.ts` is auto-generated — do NOT edit.
- **Server-only code**: Use `*.server.ts` suffix or `@tanstack/react-start/server-only` (NOT the `server-only` package — enforced by ESLint `no-restricted-imports`).
- **Dev port**: 8080 everywhere (`auth-client.ts`, `.env` `BETTER_AUTH_URL`).
- **CSS**: Tailwind v4 CSS-first via `@tailwindcss/vite` plugin (no `tailwind.config.*`). Styles in `src/styles.css` imported via `?url` in `__root.tsx` as a link rel=stylesheet.

## Auth

- Use `useAuth()` hook from `@/lib/auth` (`.tsx`, not `.ts`). Never use `useSession` from `better-auth/react` or `authClient` directly in components.
- `AuthProvider` + `PasswordChangeGuard` wrap the app in `__root.tsx`. Users with `mustChangePassword=true` are redirected to `/change-password`.
- Roles: `paciente`, `medico`, `recepcionista`, `admin`.

## Server Functions

- `createServerFn` from `@tanstack/react-start` with `.inputValidator()` (NOT `.validator()`).
- GET functions cannot use `.inputValidator()` — use POST.
- All server function files live in `src/lib/api/` as `*.functions.ts` (one per domain: appointments, doctor-schedule, time-blocks, admin-*, clinical-notes, record-access, notifications, …). Non-server-fn helpers there: `db-helpers.ts` (direct db queries), `_guards.ts` (`requireSession`/`requireRole`/`requireDoctor`, throws typed `AuthError`), `clinical-audit.ts` (append-only writes to `clinical_access_log` — never UPDATE/DELETE it). Importing `db-helpers.ts` from a route file leaks `postgres` into the client bundle — always call server fns from routes.
- Server-only modules (`@/db/index.server`, `auth.server`, `storage.server`, `clinical-html.server`, `pdf-generate.server`, …) can be pulled in lazily via the dynamic-import wrappers in `src/lib/server-imports.ts` (`getDb()`, `getAuth()`, `getFileStorage()`, …) to keep them out of the client bundle.

## Database

- Drizzle ORM with `postgres-js` driver. The client lives in `src/db/index.server.ts` — app code imports `@/db/index.server`; `src/db/index.ts` is a re-export for CLI scripts only (seed, `migrate-file-storage.ts`). Config in `drizzle.config.ts` (schema: `src/db/schema.ts`, dialect: postgresql, migrations dir: `src/db/migrations/`).
- Tables: `user`, `session`, `account`, `verification` (better-auth) + `patients`, `specialties`, `doctors`, `doctorSpecialties` (junction, unique `doctorId+specialtyId`), `doctorSchedules`, `doctorTimeBlocks`, `appointments`, `galleryImages`, `medicalRecords`, `whatsappLog`, `notifications`, plus the clinical module (Plan 10): `clinicalNotes`, `clinicalNoteAddenda`, `recordAccessRequests`, `clinicalAccessLog`.

## Business Rules

- **Softlock**: System unavailable outside 08:00–21:00 ARG time. `SoftlockBanner` in `DashboardLayout` shows the banner; `throwIfSoftlocked()` (`src/lib/softlock.ts`) blocks server operations.
- **WhatsApp bot currently DISABLED** (since 2026-11, RAM usage + unused): `WHATSAPP_BOT_ENABLED = false` in `src/lib/features.ts` skips the WhatsApp crons below, makes `/api/whatsapp/*` return 503, and hides the admin WhatsApp tab and the doctor's notifications toggle. Flip to `true` to re-enable. "WhatsApp directo" (wa.me links, `directBooking`) is unaffected.
- **Daily scheduler** (`src/lib/scheduler.ts`, `node-cron`, all `America/Argentina/Buenos_Aires`): 20:45 warm up the WhatsApp client → 21:00 send each opted-in doctor their next-day turnero as a per-doctor WhatsApp text message (`whatsapp-messages.ts`, staggered 3-5s apart to avoid bans) → 21:15 retry doctors not yet confirmed sent, deduped against `whatsapp_log` (`whatsapp-log.ts`) → 21:20 destroy the WhatsApp client to free memory. An hourly job also logs RSS/heap usage. `pdf-turnero.ts` still generates the printable turnero PDF used elsewhere (e.g. reception), separate from the WhatsApp text flow.
- **WhatsApp endpoints** (middleware in `start.ts`, all admin-only): `/api/whatsapp/status`, `/api/whatsapp/init`, `/api/whatsapp/restart`, `/api/whatsapp/qr-image`, `/api/whatsapp/send-test`.
- **Clinical module** (`docs/10-modulo-clinico.md`): access rules are the pure predicates in `src/lib/clinical-permissions.ts` (`canReadNote`/`canWriteNote`/`canSignNote`, no DB, exhaustively tested) and must be enforced inside the server fns — client-side hiding is not access control. Note bodies are HTML sanitized server-side by `sanitizeClinicalHtml()` (`clinical-html.server.ts`, closed tag allowlist) before saving; never trust client sanitization.

## Production (Render)

- **Dockerfile**: Multi-stage. Stage 1: Bun install + build. Stage 2: Node 20 + Chromium (for whatsapp-web.js Puppeteer). Bun is kept in the runtime image for `bunx drizzle-kit push` + seed in CMD, then `node start.js` handles HTTP.
- **start.js**: Custom Node HTTP server (ESM). Serves `dist/client/` static assets; proxies everything else to `dist/server/server.js` SSR handler. Port from `$PORT` env (default 8080).
- **render.yaml**: Blueprint — web service (Starter) + PostgreSQL (Basic-256mb). Env: `BETTER_AUTH_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `TZ=America/Argentina/Buenos_Aires`, `DEFAULT_DOCTOR_PASSWORD`, `DEFAULT_ADMIN_PASSWORD`, `WHATSAPP_SESSION_PATH=/var/data`.
- **WhatsApp session persistence**: Render disk mount at `/var/data` stores the whatsapp-web.js session across deploys.
- **`.dockerignore`**: Must stay in sync with `.gitignore`. Without it the build context balloons and Render builds time out.

### Deployment caution

- **Live on Render**: Web service (Starter plan) + PostgreSQL (256 MB). Treat production as fragile.
- **DB schema changes**: Always verify with `bun db:push` locally against a full copy before pushing. Avoid destructive migrations — prefer additive changes. The Render PostgreSQL plan has limited storage and no point-in-time recovery.
- **Deploy window**: Only deploy between 21:00–08:00 ARG (the maintenance/softlock window). Outside those hours the system is serving patients — a broken deploy means downtime during active hours.

## Planning Docs (`docs/`)

The team is working through a numbered series of audit-derived plans (`docs/01-...` through `docs/09-...`), each self-contained, plus `docs/10-modulo-clinico.md` — a client-requested feature (clinical history by session, permissions, dictation) added after the audit series, with a 100%-additive schema; its Phase 0 touches `doctor.tsx`, which **07** also refactors, so coordinate that file if both are in flight. `docs/00-RELEVAMIENTO.md` is the source-of-truth architecture/findings audit and `docs/README.md` holds constraints that apply to **every** plan. Both are point-in-time snapshots — check recent commits/git log before trusting a specific finding, since plans get implemented over time. Two constraints from `docs/README.md` still apply regardless of which plan is active:

- **Data freeze**: the clinic is mid-way through loading real doctor data into production. Do not write migrations or schema changes that could modify/delete existing rows. `bunx drizzle-kit push` runs on every deploy (`Dockerfile`) and auto-applies `schema.ts` changes to prod — only additive schema changes are safe during this phase; anything else needs a manual pre-migration dump and must not go through the automatic deploy push.
- **Don't harden patient login.** Patients authenticate with unverified email + DNI by design (the audience skews elderly/non-technical); this is intentional, not a bug — do not add email verification, 2FA, or extra login friction for the `paciente` role.

## Seed Defaults

- Admin: `admin@medicare.com` / `AdminMediCare2026!` (`mustChangePassword: true`)
- Doctor default password: `MediCare2026!`
- Both overridable via `DEFAULT_DOCTOR_PASSWORD` / `DEFAULT_ADMIN_PASSWORD` env vars.

## Gotchas

- Requires Docker Desktop for PostgreSQL. First setup: `bun docker:up` then `bun db:push`.
- `bun dev` starts Docker PostgreSQL before Vite. Make sure Docker is running.
- `bunfig.toml` has a 24h supply-chain guard (`minimumReleaseAge = 86400`); `@lovable.dev/vite-tanstack-config` is excluded.
- `.env` is committed (only `*.local` is gitignored). `BETTER_AUTH_SECRET` in `.env` is a dev dummy. Never commit real secrets — use `.env.local`.
- `@typescript-eslint/no-unused-vars` is off. Most lint errors are `prettier/prettier` CRLF line-ending issues.
- `components.json` has a `@react-bits` registry configured.
- Admin gallery tab: separate component at `src/components/admin/GalleryTab.tsx`.
- Path alias: `@/*` → `src/*` (tsconfig, vitest, vite config).
- `AGENTS.md` is an older, stale copy of this file (wrong API/table lists, old scheduler description) — trust CLAUDE.md where they disagree. `DESIGN.md` holds the design tokens/UI conventions.
- Tests live either in `src/test/` or co-located next to the module under test (e.g. `src/lib/appointment-state.test.ts`, `src/lib/clinical-permissions.test.ts`); both are picked up by `vitest run` (jsdom env, `src/test/setup.ts`). CI's Unit Tests step is a blocking gate — see Commands above.

## Mobile Responsive Conventions

- Tab bars with many items: wrap `<TabsList>` in `<div className="overflow-x-auto [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0">` with icon-only labels (`<span className="hidden sm:inline">`). Used in doctor, staff, and admin panels.
- Data tables → card lists on mobile: `hidden md:block` wrapper for `<table>` + `md:hidden space-y-3` for cards. Used in admin `UsersTab`, `DoctorsTab`.
- Touch targets: icon-only action buttons get `min-h-[44px] min-w-[44px]`.
- Hover-only overlays (admin gallery): add `opacity-100 md:opacity-0` so touch users always see controls.
