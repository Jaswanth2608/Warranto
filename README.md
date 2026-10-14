# Warranto

**Your purchases. Your bills. Your warranties. One place.**

Warranto is a digital warranty & bill manager. It stores purchased product details, keeps digital
copies of purchase bills, tracks warranty periods automatically, shows which warranties are active
or expiring, and reminds you before coverage ends.

The repository contains two deployable applications:

| Folder     | What it is                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| `frontend/` | React 19 + Vite SPA (Tailwind CSS 4, React Router 7, Axios)                |
| `backend/`  | Node.js + Express 5 REST API (Mongoose → MongoDB Atlas, JWT auth, bill uploads, reminders) |

Authentication is JWT-based (token in `localStorage`, sent as `Authorization: Bearer …`).
Bill files are stored in Cloudinary when credentials are present, otherwise on local disk
(development only — see [File storage](#5-file-storage)).

---

## Tech stack

| Layer     | Choice                                          |
| --------- | ----------------------------------------------- |
| Frontend  | React 19, Vite 8, Tailwind CSS 4, React Router 7, Axios |
| Backend   | Node.js 20+, Express 5, Mongoose 9              |
| Database  | MongoDB Atlas                                   |
| Auth      | JSON Web Tokens (`jsonwebtoken`) + bcryptjs     |
| Uploads   | Multer (in-memory) → Cloudinary                 |
| Email     | Nodemailer + node-cron (optional)               |
| Hosting   | Vercel (frontend), Render (backend)             |

---

## Run locally

Two terminals: the API first, then the frontend.

### 1. Backend (`http://localhost:5000`)

```bash
cd backend
npm install
cp .env.example .env      # Windows (cmd/PowerShell): copy .env.example .env
# edit backend/.env → set MONGODB_URI and JWT_SECRET (see the table below)
npm run dev               # nodemon, or: npm start
```

Smoke-check it: `curl http://localhost:5000/api/health` → `{"success":true,"status":"ok",…}` and
`curl http://localhost:5000/api/health/db` → `"connected": true` once Atlas is reachable.

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 2. Frontend (`http://localhost:5173`)

```bash
cd frontend
npm install
cp .env.example .env      # VITE_API_BASE_URL=http://localhost:5000/api
npm run dev
```

Other frontend scripts: `npm run build` (production build → `dist/`) and `npm run preview`
(serve that build locally).

### 3. Tests

```bash
cd backend
npm test          # node --test: unit tests + MongoDB integration tests
```

Unit tests always run. The integration tests (`tests/api.db.test.js`) start the real Express app
in-process and skip with a clear reason when MongoDB is unreachable. They create their own accounts
and purge that data afterwards; point them at a throwaway database to be extra safe:

```bash
MONGODB_TEST_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/warranto-test" npm test
```

---

## Project structure

```
backend/
├── server.js              # app wiring, CORS, health endpoints, graceful shutdown
├── config/                # db connection, bill storage driver (Cloudinary / local)
├── controllers/           # auth, products, bills, tasks, reminders, services, scan, calendar
├── middleware/            # protect/requireDb, validation, upload, error handler
├── models/                # User, Product, Task, Reminder, ServiceRecord
├── routes/                # /api/* route definitions
├── lib/                   # OCR bill scanner, reminder scheduler + emailer
├── tests/                 # unit tests + MongoDB integration tests (node --test)
└── .env.example           # every backend variable, placeholders only

frontend/
├── src/
│   ├── components/
│   │   ├── ui/          # design system: buttons, inputs, cards, badges, modals, tables, toasts…
│   │   ├── common/      # product icon, search input
│   │   ├── dashboard/   # stat cards, warranty overview, expirations table
│   │   ├── product/     # product card, product form, bill uploader, warranty timeline
│   │   ├── billing/     # bill preview modal
│   │   └── landing/     # header, hero, features, how-it-works, footer
│   ├── layouts/         # app shell (sidebar, topbar, mobile drawer) and auth layout
│   ├── pages/           # landing, auth, dashboard, products, bills, profile, settings…
│   ├── data/            # mock catalogue: products, user, notifications
│   ├── services/        # axios client + auth/product/bill services (backend phase)
│   ├── context/         # AuthContext, ToastContext, ProductStore
│   ├── hooks/           # useDebounce, useClickOutside, useDeleteProduct, useUi
│   ├── utils/           # dates, warranty status, selectors, formatters, constants
│   ├── App.jsx          # routes
│   ├── main.jsx         # providers
│   └── index.css        # design tokens (Tailwind v4 @theme)
└── package.json
```

---

## Pages

**Public** — Landing, Login, Register, Privacy, Terms, 404.

**Authenticated** — Dashboard, My Products, Add Product, Product Details, Edit Product,
Expiring Soon, Bills, Profile, Settings.

---

## How warranty status works

Status is always **derived from dates**, never hardcoded:

```
purchase date + warranty duration → expiry date → status
  days remaining < 0            → EXPIRED
  days remaining ≤ 30           → EXPIRING SOON
  otherwise                     → ACTIVE
```

Copy follows the same rule: `182 days remaining` · `Expires in 12 days` · `Expired 34 days ago`.
The mock catalogue generates purchase dates relative to today, so the demo stays realistic
whenever it is opened.

---

## API surface

All routes are under `/api`. Everything except `/api/health*` and `/api/auth/register|login`
requires an `Authorization: Bearer <token>` header, and every resource query is scoped to the
authenticated user (a foreign id answers `404`, never `403` with data).

| Method + path | Purpose |
| ------------- | ------- |
| `GET /api/health`, `GET /api/health/db` | Liveness + MongoDB connection state |
| `POST /api/auth/register`, `POST /api/auth/login` | Create an account / sign in |
| `GET /api/auth/me`, `POST /api/auth/logout` | Session restoration / stateless sign-out |
| `PATCH /api/auth/profile`, `POST /api/auth/change-password` | Account settings |
| `GET/POST /api/products`, `GET/PATCH/DELETE /api/products/:id` | Product CRUD + persistence |
| `GET /api/bills`, `POST /api/bills`, `PATCH/DELETE /api/bills/:id`, `GET /api/bills/:id/file` | Bill upload / replace / delete / authenticated read |
| `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id` | Action planner tasks |
| `GET/POST /api/reminders`, `GET/DELETE /api/reminders/:id` | Reminder milestones |
| `POST /api/reminders/email/send-test/:id` | Send one reminder now (needs SMTP; authenticated) |
| `GET/POST /api/services` | Product-linked service records |
| `POST /api/scan` | OCR a bill photo/PDF into field suggestions |
| `GET /api/calendar/events?year=&month=` | Warranty expiries + reminders for one month |

---

## Deploy to production

Order matters: **MongoDB Atlas → Render (API) → Vercel (SPA) → set `CLIENT_URL` on Render → verify.**

### 1. MongoDB Atlas

1. Create a free **M0** cluster.
2. Create a **database user** with password authentication. Use a dedicated application user — never
your Atlas login — with the built-in role `readWrite` on the `warranto` database only.
3. Copy the **SRV** connection string (`mongodb+srv://…`) and substitute the real password.
   URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`); an
   unescaped character is the most common cause of “could not connect to MongoDB”.
4. **Network access:** Render's free plan does not expose static outbound IPs, so the cluster must
   allow `0.0.0.0/0` for the deployed API to reach it. Accept this knowingly and reduce the risk
   with a dedicated least-privilege user, a long random password, and Atlas' default TLS. On a
   Render plan with static outbound IPs, replace `0.0.0.0/0` with those specific addresses.
5. Nothing else to configure: the `warranto` database and its indexes are created on first write.

### 2. Backend on Render

1. Render → **New → Web Service** → connect this Git repository.
2. Service settings:

   | Setting | Value |
   | ------- | ----- |
   | Root Directory | `backend` |
   | Runtime | Node |
   | Build Command | `npm ci` |
   | Start Command | `npm start` |
   | Health Check Path | `/api/health` |

3. Add the environment variables listed in the table below (Environment → Environment Variable).
   Do **not** set `PORT` — Render injects it and the server reads `process.env.PORT`.
4. Deploy, then verify:
   - `https://<your-render-service>.onrender.com/api/health` → `{"success":true,"status":"ok",…}`
   - `https://<your-render-service>.onrender.com/api/health/db` → `"connected": true`
   Free instances sleep after ~15 minutes idle; the first request afterwards can take 30–60 s.
5. Copy the service URL — the frontend needs it, and `CLIENT_URL` is set from the Vercel URL in step 4.

### 3. Frontend on Vercel

1. Vercel → **Add New → Project** → import the same repository.
2. Project settings:

   | Setting | Value |
   | ------- | ----- |
   | Root Directory | `frontend` |
   | Framework Preset | Vite (auto-detected) |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

3. Add `VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api` to **Production** *and*
   **Preview** environments. Vite inlines this value at build time, so changing it requires a
   redeploy (not just a restart).
4. Deploy and open `https://<your-vercel-app>.vercel.app`.
   `frontend/vercel.json` rewrites unmatched paths to `index.html`, so refreshing a nested route
   such as `/products/123` serves the SPA instead of a 404.
   If `VITE_API_BASE_URL` is missing at build time, the bundle logs a clear `[config]` error in the
   browser console and falls back to same-origin `/api`.

### 4. Allow the frontend origin in the API (CORS)

Set Render's `CLIENT_URL` to the deployed Vercel origin — **origin only, no path, no trailing slash**:

```
CLIENT_URL=https://<your-vercel-app>.vercel.app
```

Several origins may be comma-separated, which is handy for keeping a preview domain working:
`https://app.vercel.app,https://app-git-main.vercel.app`. An entry may also contain `*` as a
wildcard, which matches any characters except `/` — so one line allows the production alias **and**
every preview deployment:

```
CLIENT_URL=https://warranto.vercel.app,https://*.vercel.app
```

> Which origin is actually live on Vercel matters: the production alias (`https://<project>.vercel.app`)
> and the branch preview (`https://<project>-git-main-<user>.vercel.app`) are **different origins**.
> List both, or use `https://*.vercel.app`, otherwise the unlisted one is blocked by CORS.

Local `http://localhost:5173` stays allowed outside production automatically. After changing
`CLIENT_URL`, let Render redeploy/restart: an unlisted origin is rejected by CORS and appears in the
browser as a blocked request.

### 5. File storage

Bill files are handled by `backend/config/billStorage.js`, which picks a driver automatically:

| Driver | When it is used | Persistence |
| ------ | --------------- | ----------- |
| `cloudinary` | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are all set (or `BILL_STORAGE_DRIVER=cloudinary`) | Durable — survives redeploys |
| `local` | No Cloudinary credentials (`BILL_STORAGE_DIR`, default `backend/storage/`) | **Ephemeral** — Render's filesystem is wiped on every deploy/restart |

**For a real deployment, set the three `CLOUDINARY_*` variables on Render.** Without them uploads
still work in a running instance, but every file is lost on the next deploy. `GET /api/bills` and
`GET /api/bills/:id/file` read through the API so ownership is always enforced, and a Cloudinary
deployment redirects the authenticated read to the signed URL instead of exposing the bucket.

Upload limits: one file per product, `PDF`/`JPG`/`PNG`/`WEBP`, 10 MB maximum — the size limit is
enforced by Multer before the file reaches storage, and oversized multipart requests answer `413`.

### 6. Email reminders (optional)

Email is off until SMTP is configured: with `MAIL_MODE` unset the scheduler logs why it is idle and
every other feature keeps working. To enable it, set `MAIL_MODE=smtp` plus the `SMTP_*` variables on
Render and restart. The scheduler (`node-cron`, default `*/30 * * * *`) then sends due milestones
once each (idempotent per reminder, tracked by `notifiedAt`). `POST /api/reminders/email/send-test/:id`
(authenticated, own reminders only) sends a single reminder for a pre-flight check. It answers `200`
with `sent: false` and a described `error` when the provider refuses the message, so a transport
problem is reported instead of looking like a database error.

With a Gmail account the settings are `MAIL_MODE=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`,
`SMTP_SECURE=false`, `SMTP_USER=<gmail address>` and `SMTP_PASS=<16-character App Password>`. Gmail
rejects your normal account password, so turn on 2-Step Verification and create an App Password
(Google Account → Security → App passwords) first. Failed sends are recorded on the reminder
(`notificationStatus`, `lastNotificationError`) and logged without the recipient address.

⚠️ The scheduler only runs **while the Render instance is awake**. Free instances sleep after
~15 minutes idle, so scheduled sends are best-effort there — keep the instance warm with an external
uptime ping or use a paid instance if delivery to users must be dependable.

---

## Environment variables

### Backend — set these on Render (or in `backend/.env` locally)

| Name | Required | Example / notes |
| ---- | -------- | --------------- |
| `MONGODB_URI` | yes | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/warranto?retryWrites=true&w=majority` |
| `JWT_SECRET` | yes | Long random string; 48 random bytes as hex. Never reuse or commit it. |
| `CLIENT_URL` | yes | Deployed frontend origin, e.g. `https://<your-vercel-app>.vercel.app` (comma-separate extras) |
| `NODE_ENV` | yes | `production` on Render (Render sets it for Node services; set explicitly if unsure) |
| `PORT` | no | Render provides it. Leave unset; defaults to `5000` locally |
| `JWT_EXPIRES_IN` | no | Token lifetime, default `7d` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | yes for durable uploads | From the Cloudinary dashboard |
| `BILL_STORAGE_DRIVER` | no | `auto` (default), `cloudinary` or `local` |
| `BILL_STORAGE_DIR` | no | Local-driver folder, default `backend/storage` |
| `MAIL_MODE` | no | `smtp` to enable reminder emails (unset = disabled) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | no | Required when `MAIL_MODE=smtp` |
| `MAIL_FROM` | no | e.g. `no-reply@example.com` |
| `MAIL_TEST_TO` | no | Send every reminder to this address instead of the user's |
| `REMINDER_SCHEDULE` | no | Cron expression, default `*/30 * * * *` |

### Frontend — set these on Vercel (or in `frontend/.env` locally)

| Name | Required | Example / notes |
| ---- | -------- | --------------- |
| `VITE_API_BASE_URL` | yes | `https://<your-render-service>.onrender.com/api` in production; `http://localhost:5000/api` locally. Inlined at build time. |
| `VITE_APP_NAME` | no | Display name, default `Warranto` |

Only `VITE_*` variables reach the browser, and anything in `frontend/.env` ends up in the public
bundle — never put secrets there. Real `.env` files are git-ignored in both folders; commit only the
`.env.example` templates.

---

## Verify after deploying

1. **Health:** `curl https://<your-render-service>.onrender.com/api/health` → `success: true`;
   `.../api/health/db` → `connected: true`. A `degraded` answer means Atlas is unreachable (URI or
   network access).
2. **Register / login:** create an account at `https://<your-vercel-app>.vercel.app/register`, then
   sign out and back in. Reloading the page keeps you signed in (the token is restored through
   `GET /api/auth/me`).
3. **Product persistence:** add a product, refresh the browser, and confirm it is still listed — that
   proves it reached Atlas, not just local state.
4. **Warranty math:** add a product with a purchase date and warranty length, then check the expiry
   date, remaining days and status pill on the dashboard and product page.
5. **Bill upload:** attach a PDF/JPG to a product, preview it, download it, replace it, then delete
   it. Re-download after a **Render redeploy** to confirm storage persists (this is what fails on the
   local driver).
6. **Ownership:** with two accounts, copy a product URL from one account into the other — it must
   answer “Product not found.”
7. **Deep link:** open a nested URL such as `/bills` directly and refresh — it must load (Vercel SPA
   rewrite) with no console errors.

If step 1 fails with `503` / `degraded`, fix `MONGODB_URI` and Atlas network access first; everything
else depends on it.

---

## Design principles

Dark, refined and quiet — a premium personal-record tool rather than a marketing site.

| Role | Value |
| ---- | ----- |
| Background | `#0B0D10` |
| Primary surface | `#111418` |
| Secondary surface | `#171B21` |
| Borders | `#252A31` |
| Primary blue | `#4F7CFF` |
| Primary text | `#F1F3F5` |
| Secondary text | `#8B939E` |
| Success / Warning / Danger | `#3FB950` / `#D9A441` / `#D95C5C` |

Tokens live in `frontend/src/index.css` (`@theme`), so every screen shares one source of truth.
Status is shown as a subtle compact pill, cards are solid surfaces with a 1px `#252A31` border
and 10–14px radius, buttons are compact, and motion is limited to page fades, hover feedback and
modal/toast transitions. A **Reduce animations** preference sits in Settings alongside
`prefers-reduced-motion` support.

Gradients, glows, neon, glassmorphism and decorative illustration are deliberately avoided; the
product communicates PURCHASE → PRODUCT → BILL → WARRANTY → EXPIRY → REMINDER instead.
