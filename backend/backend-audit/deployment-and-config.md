# Warranto — deployment and configuration notes

This is the "outstanding configuration" part of the audit: what has to exist
before the app is real, not what code still has to be written.

## Environment overview

The project is a split frontend/backend app:

- `frontend/` — React + Vite + Tailwind CSS.
- `backend/` — Node.js + Express + MongoDB + JWT.

There is currently **no** evidence of a deployed production site in this audit.
So: do **not** claim deployment until a deploy actually succeeds and you verify
the live URL.

## Backend config

### Required env vars

Copy `backend/.env.example` to `backend/.env` and fill in at least:

- `MONGODB_URI` — MongoDB Atlas connection string for the app database.
  Without this, data endpoints return 503 and the server still starts in a
  degraded state.
- For email reminders:
  - `MAIL_MODE=smtp`
  - `SMTP_*` variables as defined in `backend/.env.example`
  Without these, the email reminder endpoints return 501.

### How backend env is loaded

`backend/server.js` loads `backend/.env` explicitly via `dotenv.config({ path: path.join(__dirname, '.env') })`. That means the backend does not depend on CWD being `backend/` to read its env file.

### Local start commands

From `backend/`:

- `npm install` — install deps
- `npm run dev` — nodemon restart loop
- `npm start` — plain node
- `npm test` — node test runner against the test DB

### Runtime note

The server is designed to start even if MongoDB is unreachable, then report
that degraded state through `/api/health` and `/api/health/db`. That is good
for ops signalling, but it also means a missing `MONGODB_URI` will not fail
fast at startup.

## Frontend config

### Required env vars

Copy `frontend/.env.example` to `frontend/.env` (or `.env.local`) and set:

- `VITE_API_BASE_URL` — base URL of the running backend during development.

If this is wrong, the frontend will call the wrong API origin and likely get
CORS / 404 / 502 responses depending on what is running.

### Local start commands

From `frontend/`:

- `npm install` — install deps
- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run preview` — preview the built app locally

### Build output

Vite builds to its standard `dist/` output. If you later deploy this as static
frontend + separate backend API, serve `frontend/dist/` as static assets and
point API calls at the backend origin.

## Scheduler requirements

The reminder scheduler lives in `backend/lib/reminderScheduler.js` and is
mounted in `server.js`. Notes:

- The scheduler runs in-process with the Express server. If you scale to
  multiple backend instances, you will need to ensure only one instance runs
  the scheduler, or move scheduling to a separate worker / cron job.
- The scheduler currently lacks durable next-run tracking, so if the server
  restarts or crashes, timing can drift and some reminders can be retried from
  scratch.
- There is no graceful shutdown handling wired for the scheduler timer; a hard
  kill can leave timer state inconsistent.
- Email delivery itself is not configured unless SMTP is set, so the scheduler
  being "running" does not yet mean reminders are delivered.

If email reminders matter in production, treat the scheduler as unfinished
infrastructure, not finished background job infrastructure.

## Storage

Bills are stored through `backend/config/billStorage.js`. In the current app
this is local filesystem storage under the backend process.

- For local dev this is fine.
- For multi-instance deploys or containers, local disk is not shared, so bill
  persistence needs a real storage backend (attachable disk, object storage, or
  MongoDB GridFS depending on your deployment).
- The bill upload path also enforces file type/size and inspects content, which
  is good, but deployment storage must preserve those guarantees and not allow
  path traversal or name collisions beyond what the backend already does.

## MongoDB Atlas

The app targets MongoDB Atlas. Practical points:

- Use a dedicated app database user, not the Atlas root/org admin, for the app
  connection string.
- Restrict network access to the Atlas cluster to the deploy environment's egress
  IPs / VPC if possible, not 0.0.0.0/0 in production.
- Rotate the connection string and any app-level credentials through secrets
  management, not committed files.
- Backups / PITR should be enabled on the Atlas cluster if this holds real user
  data.

## Secrets

Do **not** commit `.env` files or real connection strings / SMTP credentials.
Use `.env.example` as the template and keep real values out of the repo.

For deployment, inject secrets through the hosting platform’s secret manager,
not through files checked into the project.

## Deployment topology (if you go that route)

The natural deployment shape for this codebase is:

- Backend API: Node/Express service, stateful w.r.t. scheduler if you keep the
  in-process scheduler, backed by MongoDB Atlas.
- Frontend: static Vite build served by the same host or a separate static host,
  calling the backend API origin.
- Bills: shared storage if you run more than one backend instance.

There is no Workers/Cloudflare deployment manifest in this repo that I audited,
so any "serverless" claim would need a real rewrite / adapter, not just a
configuration change.

## Outstanding config checklist

Before you can honestly call this deployed and working:

- [ ] `backend/.env` has a real `MONGODB_URI` and the server connects.
- [ ] Frontend `.env` has a correct `VITE_API_BASE_URL`.
- [ ] You can register, log in, create a product, upload a bill, and see it in
  the UI against the real backend.
- [ ] If email reminders are wanted: SMTP configured, scheduler verified, and a
  reminder actually gets created/delivered in a real flow.
- [ ] If running more than one backend instance: bill storage and scheduler are
  made safe for that topology.
- [ ] Secrets are stored in the deployment platform, not in repo files.
- [ ] A real production or staging deploy is performed and its live URL is
  verified by hand — not just built locally.

## What I did not configure this audit

- No MongoDB Atlas cluster was created.
- No SMTP provider was configured.
- No deployment platform was targeted.
- No frontend production build was run this turn.

Those are configuration steps, not code changes, and should only be done when
you are ready to move past local/dev verification.
